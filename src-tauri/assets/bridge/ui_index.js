import { useBridge } from "@/bridge"
import BridgeSettings from "./BridgeSettings.vue"

const { events, lua } = useBridge()
const sourceId = "modmanager-bridge.routes"

const routes = [
  {
    path: "/modmanager-bridge",
    name: "menu.modmanagerBridge",
    component: BridgeSettings,
    meta: {
      infoBar: { visible: true, showSysInfo: true },
      topBar: { visible: true },
      luaRoute: {
        title: "Mod Manager Bridge",
        backTarget: "menu.others",
      },
    },
  },
]

function toLuaRoutes(records) {
  return records.map(record => ({
    name: record.name,
    path: record.path,
    meta: record.meta,
    ...(record.children ? { children: toLuaRoutes(record.children) } : {}),
  }))
}

function addBridgeButton(addButton) {
  addButton({
    title: "Mod Manager Bridge",
    iconId: "BNGFolder",
    action: "menu.modmanagerBridge",
  })
}

export async function onLoad() {
  window.bngRoutes.add([{ path: sourceId, routes }])
  const result = await lua.extensions.ui_router_routeManager.registerModRoutes(
    sourceId,
    toLuaRoutes(routes),
  )
  if (!result?.success) {
    window.bngRoutes.remove([sourceId])
    console.error("Failed to register Mod Manager Bridge route", result?.errors)
  }
  events.on("MainMenuButtons", addBridgeButton)
  events.emit("BroadcastMainMenuButtons")
}

export async function onUnload() {
  events.off("MainMenuButtons", addBridgeButton)
  window.bngRoutes.remove([sourceId])
  await lua.extensions.ui_router_routeManager.unregisterModRoutes(
    sourceId,
    { fallbackRoute: "menu" },
  )
}
