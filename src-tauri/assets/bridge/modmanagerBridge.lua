local M = {}

local socket = require("socket.socket")
local ltn12 = require("ltn12")

local BRIDGE_VERSION = "1.0.0"
local SETTINGS_PATH, OPTOUT_PATH, MAX_HEADER_BYTES, CLIENT_TIMEOUT, IDLE_INTERVAL =
  "/settings/modmanager_bridge.json", "/settings/cloud/mods-optout.json", 16384, 12, 0.15
local config, state = { enabled = true, port = 23519, token = "" }, { enabled = true, bindError = nil, requestsServed = 0 }
local tcp_socket, clients, inflight, idleAccum = nil, {}, 0, 0
local pausePollAccum, lastSettingsMtime, sameMtimePolls, pendingReload, modInfoSynced = 0, nil, 0, nil, false

local function getSettingsMtime()
  if not (FS and FS.stat) then return nil end
  local ok, st = pcall(function() return FS:stat(SETTINGS_PATH) end)
  return (ok and type(st) == "table") and st.modtime or nil
end

local function validatePort(port)
  local n = tonumber(port)
  n = n and math.floor(n) or nil
  return (n and n >= 1024 and n <= 65535) and n or nil
end

local function loadConfig()
  lastSettingsMtime = getSettingsMtime()
  local saved = jsonReadFile(SETTINGS_PATH)
  if type(saved) ~= "table" then return end
  if type(saved.enabled) == "boolean" then config.enabled = saved.enabled end
  config.port = validatePort(saved.port) or config.port
  if type(saved.token) == "string" then config.token = saved.token end
end

local function isOnlineEnabled()
  if settings == nil then return false end
  local v = settings.getValue("onlineFeatures")
  return v == "enable" or v == true or v == "true"
end
local function isAuthenticated() return Engine ~= nil and Engine.Online ~= nil and Engine.Online.isAuthenticated() == true end

local function buildHealth()
  return {
    ok = true, version = BRIDGE_VERSION, listening = (tcp_socket ~= nil), bindError = state.bindError,
    enabled = (config.enabled == true), onlineFeatures = (isOnlineEnabled() == true),
    authenticated = (isAuthenticated() == true),
    modManagerReady = (core_modmanager ~= nil and type(core_modmanager.isReady) == "function" and core_modmanager.isReady() == true),
    port = tonumber(config.port) or 23519, requestsServed = tonumber(state.requestsServed) or 0,
  }
end

local function closeClient(cl) cl.closed = true; if cl.sock then pcall(function() cl.sock:close() end) end end

local function stopServer()
  for i = #clients, 1, -1 do closeClient(clients[i]); clients[i] = nil end
  if tcp_socket then pcall(function() tcp_socket:close() end); tcp_socket = nil end
end

local function startServer()
  stopServer()
  state.enabled = config.enabled
  if not config.enabled then state.bindError = nil; return end
  local sock, err = socket.tcp()
  if not sock then state.bindError = tostring(err or "socket.tcp failed"); return end
  sock:setoption("reuseaddr", true)
  sock:settimeout(0, "t")
  local ok, bindErr = sock:bind("127.0.0.1", config.port)
  if ok then ok, bindErr = sock:listen(8) end
  if not ok then pcall(function() sock:close() end); state.bindError = tostring(bindErr or "bind failed"); return end
  tcp_socket, state.bindError = sock, nil
end

local function updateConfig(enabled, port)
  local prevEnabled, prevPort = config.enabled, config.port
  if enabled ~= nil then config.enabled = (enabled == true or enabled == 1 or enabled == "1" or enabled == "true") end
  if port ~= nil then config.port = validatePort(port) or config.port end
  jsonWriteFile(SETTINGS_PATH, config, true)
  lastSettingsMtime, sameMtimePolls = getSettingsMtime(), 2
  if not config.enabled then
    stopServer()
    state.enabled, state.bindError = false, nil
  elseif not tcp_socket or not prevEnabled or prevPort ~= config.port then
    startServer()
  end
  return buildHealth()
end

local function urlDecode(s) return (s:gsub("+", " "):gsub("%%(%x%x)", function(h) return string.char(tonumber(h, 16)) end)) end

local function parseQuery(qs)
  local params = {}
  for pair in string.gmatch(qs or "", "([^&]+)") do
    local k, v = pair:match("^([^=]+)=?(.*)$")
    if k then params[urlDecode(k)] = urlDecode(v or "") end
  end
  return params
end

local function flushClient(cl)
  if cl.closed or not cl.out then return true end
  local sent, err, lastSent = cl.sock:send(cl.out, cl.outPos)
  if (sent and sent >= #cl.out) or err == "closed" then closeClient(cl); return true end
  if lastSent and lastSent >= cl.outPos then cl.outPos = lastSent + 1 end
  return false
end

local function sendJson(cl, code, reason, payload)
  if cl.closed then return end
  local body = jsonEncode(payload)
  cl.out = "HTTP/1.1 " .. code .. " " .. reason .. "\r\nContent-Type: application/json\r\nContent-Length: " .. #body .. "\r\nConnection: close\r\n\r\n" .. body
  cl.outPos = 1
  flushClient(cl)
end

local function isValidHost(host)
  if type(host) ~= "string" then return false end
  return host:match("^127%.0%.0%.1$") ~= nil or host:match("^127%.0%.0%.1:%d+$") ~= nil
    or host:match("^localhost$") ~= nil or host:match("^localhost:%d+$") ~= nil
end

local function handleApiCall(cl, endpoint, postTbl)
  if not isOnlineEnabled() or not isAuthenticated() or not (core_online and core_online.apiCall) then
    return sendJson(cl, 200, "OK", { ok = false, error = "Game online session not authenticated" })
  end
  cl.waiting, inflight = true, inflight + 1
  local started = core_online.apiCall(endpoint, function(req)
    inflight = math.max(0, inflight - 1)
    cl.waiting = false
    if cl.closed then return end
    sendJson(cl, 200, "OK", { ok = (req and req.responseData ~= nil) or false, data = req and req.responseData or nil, error = req and req.error or nil })
  end, postTbl)
  if started == false then
    inflight = math.max(0, inflight - 1)
    cl.waiting = false
    sendJson(cl, 200, "OK", { ok = false, error = "Game online session not authenticated" })
  end
end

local function parseCategories(raw)
  local catIds = {}
  for part in string.gmatch(raw or "", "([^,]+)") do
    local n = tonumber(part); if n then catIds[#catIds + 1] = n end
  end
  return catIds
end

local function handleSubscriptionCall(cl, modId, endpoint, optOutValue)
  if modId == "" or not modId:match("^[%w_%-]+$") then
    return sendJson(cl, 400, "Bad Request", { ok = false, error = "Invalid mod id" })
  end
  if not isOnlineEnabled() or not isAuthenticated() or not (core_online and core_online.apiCall) then
    return sendJson(cl, 200, "OK", { ok = false, error = "Game online session not authenticated" })
  end
  local optOutData = jsonReadFile(OPTOUT_PATH)
  if type(optOutData) ~= "table" then optOutData = {} end
  optOutData[modId] = optOutValue
  jsonWriteFile(OPTOUT_PATH, optOutData)
  cl.waiting, inflight = true, inflight + 1
  local started = core_online.apiCall(endpoint .. modId, function(req)
    inflight = math.max(0, inflight - 1)
    cl.waiting = false
    if cl.closed then return end
    local rd = req and req.responseData or nil
    if rd == nil then
      return sendJson(cl, 200, "OK", { ok = false, data = nil, error = (req and req.error) or "Empty server response" })
    end
    if type(rd) == "table" and rd.error == 1 then
      return sendJson(cl, 200, "OK", { ok = false, data = rd, error = rd.message or "Subscription request failed" })
    end
    sendJson(cl, 200, "OK", { ok = true, data = rd, error = req and req.error or nil })
  end)
  if started == false then
    inflight = math.max(0, inflight - 1)
    cl.waiting = false
    sendJson(cl, 200, "OK", { ok = false, error = "Game online session not authenticated" })
  end
end

local function dispatchRequest(cl)
  local method, target = (cl.reqLine or ""):match("^(%S+)%s+(%S+)")
  if method ~= "GET" then return sendJson(cl, 405, "Method Not Allowed", { ok = false, error = "Method Not Allowed" }) end
  if not isValidHost(cl.headers["host"]) then return sendJson(cl, 403, "Forbidden", { ok = false, error = "Forbidden Host" }) end
  if config.token ~= "" and cl.headers["x-bridge-token"] ~= config.token then
    return sendJson(cl, 401, "Unauthorized", { ok = false, error = "Unauthorized" })
  end
  state.requestsServed = state.requestsServed + 1
  local path, qs = target:match("^([^?]+)%??(.*)$")
  local params = parseQuery(qs)
  if path == "/v1/health" then sendJson(cl, 200, "OK", buildHealth())
  elseif path == "/v1/state" then sendJson(cl, 200, "OK", updateConfig(params.enabled, params.port))
  elseif path == "/v1/reload" then pendingReload = 0.08; sendJson(cl, 200, "OK", { ok = true, reloading = true })
  elseif path == "/v1/mods" then
    handleApiCall(cl, "s1/v4/getMods", { query = params.query or "", order_by = params.order_by or "", order = params.order or "", page = math.max(0, (tonumber(params.page) or 1) - 1), categories = parseCategories(params.categories) })
  elseif path == "/v1/subscribed" then
    handleApiCall(cl, "s1/v4/getMods", { query = params.query or "", order_by = params.order_by or "update", order = params.order or "desc", page = math.max(0, (tonumber(params.page) or 1) - 1), categories = parseCategories(params.categories), own = 1 })
  elseif path == "/v1/mod" then
    local modId = params.id or ""
    if modId == "" or not modId:match("^[%w_%-]+$") then return sendJson(cl, 400, "Bad Request", { ok = false, error = "Invalid mod id" }) end
    handleApiCall(cl, "s1/v4/getMod/" .. modId)
  elseif path == "/v1/subscribe" then handleSubscriptionCall(cl, params.id or "", "s2/v4/modSubscribe/", nil)
  elseif path == "/v1/unsubscribe" then handleSubscriptionCall(cl, params.id or "", "s2/v4/modUnsubscribe/", true)
  else sendJson(cl, 404, "Not Found", { ok = false, error = "Not Found" }) end
end

local function readClient(cl)
  while not cl.closed do
    local line, err, partial = cl.sock:receive("*l")
    if line then
      if cl.lineBuf ~= "" then line = cl.lineBuf .. line; cl.lineBuf = "" end
      cl.bytes = cl.bytes + #line + 2
      if cl.bytes > MAX_HEADER_BYTES then return sendJson(cl, 431, "Request Header Fields Too Large", { ok = false, error = "Headers too large" }) end
      if not cl.reqLine then if line ~= "" then cl.reqLine = line end
      elseif line == "" then return dispatchRequest(cl)
      else local k, v = line:match("^([^:]+):%s*(.*)$"); if k then cl.headers[string.lower(k)] = v:gsub("%s+$", "") end end
    else
      if partial and #partial > 0 then
        if cl.bytes + #cl.lineBuf + #partial > MAX_HEADER_BYTES then return sendJson(cl, 431, "Request Header Fields Too Large", { ok = false, error = "Headers too large" }) end
        cl.lineBuf = cl.lineBuf .. partial
      end
      if err == "closed" then closeClient(cl) end
      break
    end
  end
end

local function enqueueSocket(c)
  c:settimeout(0, "t")
  clients[#clients + 1] = { sock = c, lineBuf = "", bytes = 0, headers = {}, age = 0, outPos = 1 }
end

local function pollPausedSettings(dt)
  pausePollAccum = pausePollAccum + dt
  if pausePollAccum < 1.0 then return end
  pausePollAccum = 0
  local mtime = getSettingsMtime()
  if mtime ~= nil and mtime == lastSettingsMtime and sameMtimePolls <= 0 then return end
  if mtime ~= lastSettingsMtime then lastSettingsMtime, sameMtimePolls = mtime, 2
  elseif sameMtimePolls > 0 then sameMtimePolls = sameMtimePolls - 1 end
  local saved = jsonReadFile(SETTINGS_PATH)
  if type(saved) ~= "table" then return end
  local nextEnabled = (type(saved.enabled) == "boolean") and saved.enabled or config.enabled
  local nextPort = validatePort(saved.port) or config.port
  if nextEnabled and (not state.enabled or not tcp_socket or nextPort ~= config.port) then
    loadConfig(); startServer()
  end
end

local function ensureInGameModInfo()
  if not (core_modmanager and type(core_modmanager.getModDB) == "function") then return end
  local m = core_modmanager.getModDB("modmanager_bridge")
  if type(m) ~= "table" then return end
  if type(m.modData) == "table" and m.modID == nil and m.id == nil and m.modInfoPath == "/scripts/modmanager_bridge/" and m.modData.title == nil and m.modData.version_string == BRIDGE_VERSION then
    modInfoSynced = true; return
  end
  local d = jsonReadFile("/scripts/modmanager_bridge/info.json")
  if type(d) ~= "table" then return end
  m.modID, m.id, m.modInfoPath = nil, nil, "/scripts/modmanager_bridge/"
  d.title, d.status, d.icon = nil, d.status or "Active", "/scripts/modmanager_bridge/icon.jpg"
  m.modData, modInfoSynced = d, true
  if type(core_modmanager.requestState) == "function" then core_modmanager.requestState() end
end

local function onUpdate(dtReal)
  local dt = dtReal or 0
  if pendingReload ~= nil then
    pendingReload = pendingReload - dt
    if pendingReload <= 0 and #clients == 0 and inflight == 0 then pendingReload = nil; stopServer(); extensions.reload("util_modmanagerBridge"); return end
  end
  if not modInfoSynced and core_modmanager and type(core_modmanager.isReady) == "function" and core_modmanager.isReady() then pcall(ensureInGameModInfo); modInfoSynced = true end
  if not state.enabled or not tcp_socket then pollPausedSettings(dt); return end
  pausePollAccum = 0
  if #clients == 0 and inflight == 0 then
    idleAccum = idleAccum + dt
    if idleAccum < IDLE_INTERVAL then return end
    idleAccum = 0
    local c = tcp_socket:accept()
    if not c then return end
    enqueueSocket(c)
  else
    while #clients < 16 do local c = tcp_socket:accept(); if not c then break end; enqueueSocket(c) end
  end
  for i = #clients, 1, -1 do
    local cl = clients[i]
    cl.age = cl.age + dt
    if cl.closed then table.remove(clients, i)
    elseif cl.age > CLIENT_TIMEOUT then closeClient(cl); table.remove(clients, i)
    elseif cl.out then if flushClient(cl) then table.remove(clients, i) end
    elseif not cl.waiting then readClient(cl); if cl.closed then table.remove(clients, i) end
    end
  end
end

M.onExtensionLoaded = function() loadConfig(); startServer(); pcall(ensureInGameModInfo) end
M.onModManagerReady = function() pcall(ensureInGameModInfo) end
M.onExtensionUnloaded = stopServer
M.onUpdate = onUpdate
M.getStatus = buildHealth
M.updateConfig = updateConfig
return M
