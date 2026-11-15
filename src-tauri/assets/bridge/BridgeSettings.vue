<template>
  <LayoutSingle class="bridge-layout" v-bng-on-ui-nav:back,menu="goBack">
    <div class="bridge-settings-view">
      <div class="bridge-panel">
        <div class="bridge-header">
          <BngButton
            class="bridge-back-btn"
            v-bng-blur
            :accent="ACCENTS.custom_old"
            :icon-left="icons.arrowSmallLeft"
            @click="goBack"
          >Back</BngButton>
          <BngScreenHeading class="bridge-heading" divider type="line">Mod Manager Bridge</BngScreenHeading>
        </div>

        <div class="bridge-card" v-bng-blur>
          <div class="status-grid">
            <div class="status-item">
              <span class="status-label">Bridge Status</span>
              <span class="status-value" :class="status.listening ? 'is-ok' : 'is-warn'">
                {{ status.listening ? "Listening" : status.enabled ? "Stopped" : "Paused" }}
              </span>
            </div>
            <div class="status-item">
              <span class="status-label">Online Features</span>
              <span class="status-value" :class="status.onlineFeatures ? 'is-ok' : 'is-warn'">
                {{ status.onlineFeatures ? "Enabled" : "Disabled" }}
              </span>
            </div>
            <div class="status-item">
              <span class="status-label">Session Authenticated</span>
              <span class="status-value" :class="status.authenticated ? 'is-ok' : 'is-warn'">
                {{ status.authenticated ? "Authenticated" : "Not Authenticated" }}
              </span>
            </div>
            <div class="status-item">
              <span class="status-label">Requests Served</span>
              <span class="status-value">{{ status.requestsServed }}</span>
            </div>
          </div>

          <div v-if="status.bindError" class="bridge-error">Bind Error: {{ status.bindError }}</div>
          <div v-if="runtimeError" class="bridge-error">{{ runtimeError }}</div>

          <div class="control-row">
            <BngSwitch v-model="enabled" :disabled="busy" label="Enable Localhost Bridge" @change="onToggleEnabled" />
          </div>

          <div class="port-row">
            <div class="port-input">
              <BngInput
                v-model="portInput"
                type="number"
                :min="1024"
                :max="65535"
                :step="1"
                :no-spinners="true"
                :show-external-button="false"
                :disabled="busy"
                label="Localhost Port (127.0.0.1)"
              />
            </div>
            <BngButton :accent="ACCENTS.main" :disabled="busy || !isPortValid" @click="applyPort">Apply Port</BngButton>
            <BngButton :accent="ACCENTS.secondary" :disabled="busy" @click="refreshStatus">Refresh</BngButton>
          </div>

          <p class="bridge-note">
            Bridge v1.0.0 — Localhost listener (127.0.0.1:{{ status.port }}): polls once every 150ms when idle and calls
            core_online.apiCall directly without Chromium UI churn.
          </p>
        </div>
      </div>
    </div>
  </LayoutSingle>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue"
import { LayoutSingle } from "@/common/layouts"
import { vBngBlur, vBngOnUiNav } from "@/common/directives"
import { BngScreenHeading, BngSwitch, BngInput, BngButton, ACCENTS, icons } from "@/common/components/base"
import { useBridge } from "@/bridge"

const { api, lua } = useBridge()
const busy = ref(false)
const enabled = ref(true)
const portInput = ref(23519)
const runtimeError = ref(null)
const status = ref({
  listening: false,
  bindError: null,
  enabled: true,
  port: 23519,
  onlineFeatures: false,
  authenticated: false,
  modManagerReady: false,
  requestsServed: 0,
})

let pollTimer = null
let pollInFlight = false

const isPortValid = computed(() => {
  const n = Number(portInput.value)
  return Number.isInteger(n) && n >= 1024 && n <= 65535
})

function callEngineLua(expr) {
  return new Promise((resolve, reject) => {
    if (!api || typeof api.engineLua !== "function") {
      reject(new Error("BeamNG bridge API is unavailable."))
      return
    }
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error("Bridge Lua call timed out."))
    }, 5000)
    try {
      api.engineLua(expr, result => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(result)
      })
    } catch (err) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    }
  })
}

function applyStatus(next, syncPort = false) {
  if (!next || typeof next !== "object") {
    runtimeError.value = "Bridge extension returned an empty response."
    return false
  }
  runtimeError.value = null
  status.value = {
    listening: Boolean(next.listening),
    bindError: next.bindError || null,
    enabled: next.enabled !== undefined ? Boolean(next.enabled) : true,
    port: Number(next.port) || 23519,
    onlineFeatures: Boolean(next.onlineFeatures),
    authenticated: Boolean(next.authenticated),
    modManagerReady: Boolean(next.modManagerReady),
    requestsServed: Number(next.requestsServed) || 0,
  }
  enabled.value = status.value.enabled
  if (syncPort) {
    portInput.value = status.value.port
  }
  return true
}

function buildBridgeLua(methodCall) {
  return `(function() if not extensions.util_modmanagerBridge then extensions.load('util_modmanagerBridge') end; return extensions.util_modmanagerBridge and extensions.util_modmanagerBridge.${methodCall} or { ok = false, bindError = 'util_modmanagerBridge not loaded' } end)()`
}

async function runBridgeCall(methodCall, { syncPort = false, showBusy = false } = {}) {
  if (showBusy) busy.value = true
  try {
    const next = await callEngineLua(buildBridgeLua(methodCall))
    applyStatus(next, syncPort)
  } catch (err) {
    runtimeError.value = err?.message || "Failed to communicate with bridge Lua extension."
  } finally {
    if (showBusy) busy.value = false
  }
}

async function refreshStatus() {
  await runBridgeCall("getStatus()", { syncPort: true, showBusy: true })
}

async function pollStatus() {
  if (pollInFlight || busy.value) return
  pollInFlight = true
  try {
    await runBridgeCall("getStatus()", { syncPort: false, showBusy: false })
  } finally {
    pollInFlight = false
  }
}

async function onToggleEnabled(nextVal) {
  await runBridgeCall(`updateConfig(${Boolean(nextVal)}, nil)`, {
    syncPort: false,
    showBusy: true,
  })
}

async function applyPort() {
  if (!isPortValid.value) return
  await runBridgeCall(
    `updateConfig(${Boolean(enabled.value)}, ${Number(portInput.value)})`,
    { syncPort: true, showBusy: true }
  )
}

async function goBack() {
  try {
    const res = await lua.extensions.ui_router.back()
    if (res !== false && res?.result !== false) return
  } catch {}
  try {
    const res = await lua.extensions.ui_router.navigate("menu.others", null, null)
    if (res !== false && res?.result !== false) return
  } catch {}
  if (typeof window !== "undefined" && window.history) {
    window.history.back()
  }
}

onMounted(() => {
  refreshStatus()
  pollTimer = setInterval(pollStatus, 2500)
})

onBeforeUnmount(() => {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<style scoped>
.bridge-layout { --content-max-width: unset; background: transparent; }
.bridge-settings-view { display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; padding: 2rem; color: #f4f4f5; background: transparent; }
.bridge-panel { width: 100%; max-width: 44rem; background: transparent; }
.bridge-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
.bridge-back-btn {
  --bng-button-custom-margin: 0; --bng-button-margin: 0;
  --bng-button-custom-enabled: var(--bng-off-black); --bng-button-custom-hover: var(--bng-orange-600); --bng-button-custom-active: var(--bng-orange-800); --bng-button-custom-disabled: var(--bng-off-black);
  --bng-button-custom-border-enabled: var(--bng-cool-gray-600); --bng-button-custom-border-hover: var(--bng-orange-400); --bng-button-custom-border-active: var(--bng-orange-600); --bng-button-custom-border-disabled: rgba(var(--bng-cool-gray-800-rgb), 0.8);
  --bng-button-custom-enabled-opacity: 0.8; --bng-button-custom-hover-opacity: 1; --bng-button-custom-active-opacity: 1; --bng-button-custom-disabled-opacity: 0.25;
  --bng-button-custom-border-radius: var(--bng-corners-2); --bng-button-padding: 0.25em 0.75em; --bng-button-min-width: 2em; --bng-content-align: center;
  flex: 0 0 auto; height: 2.5rem; align-items: center; gap: 0.25em; margin: 0 !important;
}
.bridge-heading { flex: 1; margin: 0; }
.bridge-card { display: flex; flex-direction: column; gap: 1.25rem; padding: 1.5rem; background: rgba(var(--bng-off-black-rgb, 18, 21, 28), 0.58); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: var(--bng-corners-2, 8px); }
.status-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
.status-item { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.75rem; background: rgba(var(--bng-off-black-rgb, 14, 17, 24), 0.44); border: 1px solid rgba(255, 255, 255, 0.09); border-radius: var(--bng-corners-1, 4px); }
.status-label { font-size: 0.8rem; color: #a1a1aa; }
.status-value { font-size: 1rem; font-weight: 600; }
.is-ok { color: #4ade80; }
.is-warn { color: #fbbf24; }
.bridge-error { padding: 0.65rem 0.75rem; background: rgba(var(--bng-off-black-rgb, 14, 17, 24), 0.44); border: 1px solid rgba(239, 68, 68, 0.55); border-radius: var(--bng-corners-1, 4px); color: #fecaca; font-size: 0.85rem; }
.control-row { display: flex; align-items: center; }
.port-row { display: flex; align-items: flex-end; gap: 0.75rem; }
.port-input { flex: 1; }
.port-input :deep(.input-container) { background: rgba(var(--bng-off-black-rgb, 14, 17, 24), 0.44); border: 1px solid rgba(255, 255, 255, 0.09); border-radius: var(--bng-corners-1, 4px); }
.bridge-note { margin: 0; font-size: 0.82rem; line-height: 1.45; color: #a1a1aa; }
</style>
