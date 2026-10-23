package com.hizuri.floating

/** The one event channel from the service to JS; set while the module lives (HizuriFloatModule). */
object FloatBus {
  const val EVENT = "onFloatEvent"

  @Volatile var emit: ((Map<String, Any?>) -> Unit)? = null

  fun send(type: String, extra: Map<String, Any?> = emptyMap()) {
    emit?.invoke(mapOf("type" to type) + extra)
  }
}
