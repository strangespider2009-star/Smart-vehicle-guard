/*
  SMART DRIVE GUARD V2 — PREFERRED, MORE RELIABLE MEGA VERSION
  Arduino MEGA 2560 + R307/AS608 + HC-05 (LED demonstration only)

  R307/AS608 TX -> MEGA RX1 (D19); sensor RX <- MEGA TX1 (D18)
  HC-05 TX -> MEGA RX2 (D17); HC-05 RX <- MEGA TX2 (D16)
  IMPORTANT: Level-shift MEGA TX2 (5V) to HC-05 RX (3.3V logic).
  Follow sensor datasheet for sensor power and logic levels.
  D6 -> 220-ohm resistor -> green LED -> GND
  D7 -> 220-ohm resistor -> red LED -> GND
  All grounds common. Never connect LEDs to real vehicle systems.
  Install Adafruit Fingerprint Sensor Library via Arduino IDE.
*/

#include <Adafruit_Fingerprint.h>

Adafruit_Fingerprint finger = Adafruit_Fingerprint(&Serial1);
#define bluetooth Serial2

const byte GREEN_LED = 6;
const byte RED_LED = 7;
const uint32_t SCAN_TIMEOUT_MS = 16000UL;
String line = "";
bool sensorReady = false;

void lightsOff() { digitalWrite(GREEN_LED, LOW); digitalWrite(RED_LED, LOW); }
void ledFail() { digitalWrite(GREEN_LED, LOW); digitalWrite(RED_LED, HIGH); }
void ledPass() { digitalWrite(RED_LED, LOW); digitalWrite(GREEN_LED, HIGH); }

void response(const String &tag, int slot, const String &reason, const String &nonce) {
  bluetooth.print(tag);
  if (slot >= 0) { bluetooth.print(' '); bluetooth.print(slot); }
  if (reason.length()) { bluetooth.print(' '); bluetooth.print(reason); }
  bluetooth.print(' '); bluetooth.println(nonce);
}

bool validSlot(const String &value) {
  if (!value.length() || value.length() > 3) return false;
  for (unsigned int i = 0; i < value.length(); ++i) if (!isDigit(value[i])) return false;
  int slot = value.toInt();
  return slot >= 1 && slot <= 127;
}
bool validNonce(const String &s) {
  if (!s.length() || s.length() > 9) return false;
  for (unsigned int i = 0; i < s.length(); ++i) if (!isDigit(s[i])) return false;
  return true;
}

// Mega hardware UARTs can receive Bluetooth and fingerprint traffic independently.
bool waitFinger(bool present, uint32_t duration) {
  uint32_t start = millis();
  while ((uint32_t)(millis() - start) < duration) {
    uint8_t result = finger.getImage();
    if (present && result == FINGERPRINT_OK) return true;
    if (!present && result == FINGERPRINT_NOFINGER) return true;
    delay(90);
  }
  return false;
}

void enroll(int slot, const String &nonce) {
  if (!sensorReady) { ledFail(); response("ENROLL_FAIL", slot, "SENSOR_OFFLINE", nonce); return; }
  // Wait for fresh touch, then scan two impressions to the same slot.
  bool ok = waitFinger(true, SCAN_TIMEOUT_MS) && finger.image2Tz(1) == FINGERPRINT_OK;
  if (!ok) {
    ledFail(); response("ENROLL_FAIL", slot, "FIRST_SCAN", nonce); return;
  }
  bluetooth.println("STATUS REMOVE_FINGER");
  if (!waitFinger(false, SCAN_TIMEOUT_MS)) {
    ledFail(); response("ENROLL_FAIL", slot, "REMOVE_TIMEOUT", nonce); return;
  }
  bluetooth.println("STATUS PLACE_SAME_FINGER_AGAIN");
  ok = waitFinger(true, SCAN_TIMEOUT_MS) && finger.image2Tz(2) == FINGERPRINT_OK;
  if (!ok || finger.createModel() != FINGERPRINT_OK) {
    ledFail(); response("ENROLL_FAIL", slot, "SECOND_SCAN_OR_MISMATCH", nonce); return;
  }
  if (finger.storeModel(slot) != FINGERPRINT_OK) {
    ledFail(); response("ENROLL_FAIL", slot, "STORE_ERROR", nonce); return;
  }
  lightsOff(); response("ENROLL_OK", slot, "", nonce);
}

void verify(int slot, const String &nonce) {
  if (!sensorReady) { ledFail(); response("VERIFY_FAIL", slot, "SENSOR_OFFLINE", nonce); return; }
  bool touched = waitFinger(true, SCAN_TIMEOUT_MS);
  bool scanned = touched && finger.image2Tz(1) == FINGERPRINT_OK;
  uint8_t match = scanned ? finger.fingerFastSearch() : FINGERPRINT_NOTFOUND;
  int actualSlot = scanned && match == FINGERPRINT_OK ? finger.fingerID : -1;
  if (!touched) { ledFail(); response("VERIFY_FAIL", slot, "TIMEOUT", nonce); }
  else if (!scanned) { ledFail(); response("VERIFY_FAIL", slot, "BAD_SCAN", nonce); }
  else if (match != FINGERPRINT_OK) { ledFail(); response("VERIFY_FAIL", slot, "UNKNOWN_FINGER", nonce); }
  else if (actualSlot != slot) { ledFail(); response("VERIFY_FAIL", slot, "WRONG_PERSON", nonce); }
  else {
    // Do not turn on green yet: the face and owner checks must also pass.
    lightsOff(); response("VERIFY_OK", slot, "", nonce);
  }
}

void deleteTemplate(int slot, const String &nonce) {
  if (!sensorReady) { ledFail(); response("DELETE_FAIL", slot, "SENSOR_OFFLINE", nonce); return; }
  bool ok = finger.deleteModel(slot) == FINGERPRINT_OK;
  if (ok) { lightsOff(); response("DELETE_OK", slot, "", nonce); }
  else { ledFail(); response("DELETE_FAIL", slot, "DELETE_ERROR", nonce); }
}

void handle(String received) {
  received.trim();
  int a = received.indexOf(' ');
  String cmd = a < 0 ? received : received.substring(0, a);
  String rest = a < 0 ? "" : received.substring(a + 1);
  int b = rest.indexOf(' ');
  String param = b < 0 ? "" : rest.substring(0, b);
  String nonce = b < 0 ? rest : rest.substring(b + 1);

  if (cmd == "PING") {
    if (!validNonce(rest)) return;
    response("PONG", -1, sensorReady ? "SENSOR_OK" : "SENSOR_MISSING", rest);
    return;
  }
  if (cmd == "RESET") {
    if (!validNonce(rest)) return;
    lightsOff(); response("RESET_OK", -1, "", rest); return;
  }
  if (cmd == "RESULT") {
    if (!validNonce(nonce)) return;
    if (param == "PASS") { ledPass(); response("RESULT_OK", -1, "PASS", nonce); }
    else if (param == "FAIL") { ledFail(); response("RESULT_OK", -1, "FAIL", nonce); }
    else { ledFail(); response("ERROR", -1, "BAD_RESULT", nonce); }
    return;
  }
  if (!validSlot(param) || !validNonce(nonce)) {
    ledFail();
    if (validNonce(nonce)) response("ERROR", -1, "BAD_SLOT_OR_COMMAND", nonce);
    return;
  }
  int slot = param.toInt();
  if (cmd == "ENROLL") enroll(slot, nonce);
  else if (cmd == "VERIFY") verify(slot, nonce);
  else if (cmd == "DELETE") deleteTemplate(slot, nonce);
  else { ledFail(); response("ERROR", -1, "UNKNOWN_COMMAND", nonce); }
}

void setup() {
  pinMode(GREEN_LED, OUTPUT); pinMode(RED_LED, OUTPUT); lightsOff();
  Serial.begin(9600); bluetooth.begin(9600);
  finger.begin(57600);
  sensorReady = finger.verifyPassword();
  Serial.println(sensorReady ? "FINGERPRINT SENSOR READY" : "FINGERPRINT SENSOR NOT FOUND");
  Serial.println("HC-05 UART 9600, LED demonstration only");
  line.reserve(42);
}

void loop() {
  while (bluetooth.available()) {
    char ch = (char)bluetooth.read();
    if (ch == '\n') {
      if (line.length()) handle(line);
      line = "";
    } else if (ch != '\r') {
      if (line.length() < 40) line += ch;
      else { line = ""; ledFail(); }
    }
  }
}
