// Temporary diagnostic, not classroom controller firmware. No upload approval.
// Build: Arduino ESP32 2.0.12, ESP32 Dev Module, PartitionScheme=huge_app.
#include <Arduino.h>
#include <string.h>
#ifndef SERVO_OBSERVER_FLASH_GUARDS
#error "Use scripts/build-servo-observer.ps1; the reviewed flash-write guards are required."
#endif

namespace {
constexpr uint32_t baselineMs = 500;
constexpr uint32_t captureMs = 2000;
constexpr size_t byteLimit = 16384;
constexpr size_t chunkLimit = 512;
constexpr size_t chunkBytes = 32;
constexpr int rxPin = 17;
constexpr int txPin = 16;
struct Chunk { uint32_t ms; uint16_t offset; uint8_t count; };
uint8_t bytes[byteLimit];
Chunk chunks[chunkLimit];
size_t usedBytes = 0, usedChunks = 0, dumpIndex = 0;
uint32_t omitted = 0, started = 0, sentAt = 0;
volatile uint32_t uartErrors = 0;
uint32_t errorsAtStart = 0, observedErrors = 0;
uint8_t requestedId = 0;
bool sent = false, stopped = false, txFailed = false;
enum class Phase { Idle, Capture, DumpHeader, DumpChunks, DumpEnd };
Phase phase = Phase::Idle;
char command[32];
size_t commandLength = 0;
bool invalidLine = false;

void report(const char *line) {
  // USB UART only. Buffer has room for every fixed status line used here.
  Serial.println(line);
}

void finish(bool cancelled) {
  stopped = cancelled;
  observedErrors = uartErrors - errorsAtStart;
  phase = Phase::DumpHeader;
}

void start(uint8_t id) {
  // Each complete command starts one finite sample. No automatic replay/retry.
  if (phase != Phase::Idle) { report("ERR busy"); return; }
  usedBytes = usedChunks = dumpIndex = 0;
  omitted = sentAt = 0;
  sent = stopped = txFailed = false;
  requestedId = id;
  errorsAtStart = uartErrors;
  started = millis();
  phase = Phase::Capture;
}

void handleLine() {
  command[commandLength] = '\0';
  if (invalidLine) { report("ERR invalid line"); }
  else if (!strcmp(command, "STOP")) {
    if (phase == Phase::Capture) finish(true);
  }
  else if (!strcmp(command, "INFO")) {
    report("NEXARM_OBSERVER_1_GUARDED; CAPTURE | POS 1..6 | STOP");
  }
  else if (!strcmp(command, "CAPTURE")) start(0);
  else if (commandLength == 5 && !memcmp(command, "POS ", 4) && command[4] >= '1' && command[4] <= '6') {
    start(static_cast<uint8_t>(command[4] - '0'));
  }
  else if (commandLength) report("ERR unknown command; nothing forwarded");
  commandLength = 0;
  invalidLine = false;
}

void pollHost() {
  // Bound work per loop; binary factory packets have no passthrough path.
  for (size_t n = 0; n < 64 && Serial.available(); ++n) {
    const int ch = Serial.read();
    if (ch == '\n') { handleLine(); continue; }
    if (ch == '\r') continue;
    if (ch < 32 || ch > 126 || commandLength >= sizeof(command) - 1) { invalidLine = true; continue; }
    if (!invalidLine) command[commandLength++] = static_cast<char>(ch);
  }
}

void sampleBus() {
  uint8_t raw[chunkBytes];
  size_t count = 0;
  while (count < sizeof(raw) && Serial1.available()) {
    const int value = Serial1.read();
    if (value >= 0) raw[count++] = static_cast<uint8_t>(value);
  }
  if (!count) return;
  if (phase != Phase::Capture) return; // Discard idle traffic, never transmit it.
  if (usedChunks >= chunkLimit || usedBytes + count > byteLimit) {
    omitted += count;
    return;
  }
  chunks[usedChunks++] = {millis() - started, static_cast<uint16_t>(usedBytes), static_cast<uint8_t>(count)};
  memcpy(bytes + usedBytes, raw, count);
  usedBytes += count;
}

void captureStep() {
  const uint32_t elapsed = millis() - started;
  // A delayed loop must not send a stale request after its capture has ended.
  if (elapsed >= captureMs) { finish(false); return; }
  if (requestedId && !sent && elapsed >= baselineMs) {
    // The only downstream write in this entire sketch: READ position, 2 bytes.
    // FF FF ID 04 02 38 02 CK; never WRITE, broadcast, torque or mode commands.
    uint8_t packet[] = {0xff, 0xff, requestedId, 4, 2, 0x38, 2, 0};
    packet[7] = static_cast<uint8_t>(~(requestedId + 4 + 2 + 0x38 + 2));
    sent = true; // Consume before sending; short writes are not retried.
    sentAt = elapsed;
    if (Serial1.write(packet, sizeof(packet)) != sizeof(packet)) {
      txFailed = true;
      finish(true);
    }
  }
}

void dumpStep() {
  char line[256];
  int length = 0;
  if (phase == Phase::DumpHeader) {
    length = snprintf(line, sizeof(line), "{\"observer\":1,\"kind\":\"begin\",\"id\":%u,\"sent\":%s,\"sentAtMs\":%lu}\n",
      requestedId, sent ? "true" : "false", static_cast<unsigned long>(sentAt));
  }
  else if (phase == Phase::DumpChunks) {
    if (dumpIndex >= usedChunks) { phase = Phase::DumpEnd; return; }
    const Chunk &c = chunks[dumpIndex];
    char hex[chunkBytes * 2 + 1];
    const char *digits = "0123456789abcdef";
    for (size_t i = 0; i < c.count; ++i) {
      hex[i * 2] = digits[bytes[c.offset + i] >> 4];
      hex[i * 2 + 1] = digits[bytes[c.offset + i] & 15];
    }
    hex[c.count * 2] = '\0';
    length = snprintf(line, sizeof(line), "{\"kind\":\"rx\",\"ms\":%lu,\"hex\":\"%s\"}\n", static_cast<unsigned long>(c.ms), hex);
  }
  else if (phase == Phase::DumpEnd) {
    length = snprintf(line, sizeof(line), "{\"kind\":\"end\",\"bytes\":%u,\"omittedBytes\":%lu,\"uartErrorEvents\":%lu,\"stopped\":%s,\"txFailed\":%s}\n",
      static_cast<unsigned>(usedBytes), static_cast<unsigned long>(omitted), static_cast<unsigned long>(observedErrors),
      stopped ? "true" : "false", txFailed ? "true" : "false");
  }
  if (length <= 0 || length >= static_cast<int>(sizeof(line))) { phase = Phase::Idle; report("ERR export"); return; }
  if (Serial.availableForWrite() < length) return;
  Serial.write(reinterpret_cast<const uint8_t *>(line), length);
  if (phase == Phase::DumpHeader) phase = Phase::DumpChunks;
  else if (phase == Phase::DumpChunks) ++dumpIndex;
  else phase = Phase::Idle;
}
} // namespace

void setup() {
  Serial.setTxBufferSize(1024);
  Serial.begin(115200);
  Serial1.setRxBufferSize(4096);
  Serial1.begin(1000000, SERIAL_8N1, rxPin, txPin);
  Serial1.onReceiveError([](hardwareSerial_error_t) { ++uartErrors; });
  report("NEXARM_OBSERVER_1_GUARDED; idle; explicit requests only");
}

void loop() {
  pollHost(); // STOP is processed before any possible downstream request.
  sampleBus();
  if (phase == Phase::Capture) captureStep();
  else if (phase != Phase::Idle) dumpStep();
  delay(1);
}

// Deliberately replace Arduino's app_main/initArduino startup. The standard
// initArduino calls nvs_flash_init and may erase NVS on an incompatible layout.
// ESP-IDF has initialized the scheduler/timer before calling app_main; this
// observer needs only those services and UART. No NVS, OTA, radio or board init.
TaskHandle_t loopTaskHandle = nullptr;
bool loopTaskWDTEnabled = false;
static void observerTask(void *) {
  setup();
  for (;;) loop();
}
extern "C" void app_main() {
  if (xTaskCreatePinnedToCore(observerTask, "servo_observer", 8192, nullptr, 1, &loopTaskHandle, 1) != pdPASS) {
    // Fail without initializing UART or transmitting any downstream bytes.
    for (;;) vTaskDelay(pdMS_TO_TICKS(1000));
  }
}
