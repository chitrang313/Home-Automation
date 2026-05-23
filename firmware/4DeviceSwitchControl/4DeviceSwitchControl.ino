/**********************************************************************************
 *  TITLE: Firebase Web-UI + 4× TTP223 Capacitive Touch control of 4 Relays
 *         using ESP32 with Real-time feedback
 *
 *  Hardware:
 *    - ESP32 DevKIT V1
 *    - 4-channel 5V relay module (active-LOW)
 *    - 4× TTP223 capacitive touch modules, A-pad bridged (active LOW, momentary)
 *
 *  Each touch sensor is wired to a GPIO with INPUT_PULLUP and a FALLING-edge
 *  interrupt. Brief taps are captured by hardware regardless of loop blocking.
 **********************************************************************************/

#include <WiFi.h>
#include <Firebase_ESP_Client.h>

// Wi-Fi credentials
const char* ssid = "📡";
const char* password = "password";

// Firebase credentials
#define API_KEY "AIzaSyC34j2I8E9N2dAlmbwcnX6LlEADIgFKLXA"
#define DATABASE_URL "https://home-automation-a86aa-default-rtdb.firebaseio.com/"
#define USER_EMAIL "chitrang313@gmail.com"
#define USER_PASSWORD "csP181094@#$%^"

// Relay GPIOs (active LOW)
#define RELAY1 23
#define RELAY2 19
#define RELAY3 18
#define RELAY4 5

// TTP223 touch sensor GPIOs
#define TouchPin1 13
#define TouchPin2 12
#define TouchPin3 14
#define TouchPin4 27

// Firebase setup
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// Per-channel interrupt flags and debounce timestamps
volatile bool touchPending[4]  = { false, false, false, false };
volatile unsigned long lastTouchMs[4] = { 0, 0, 0, 0 };
const unsigned long TOUCH_DEBOUNCE_MS = 150;  // ignore retriggers within this window

void IRAM_ATTR touch1ISR() {
  unsigned long now = millis();
  if (now - lastTouchMs[0] > TOUCH_DEBOUNCE_MS) {
    touchPending[0] = true;
    lastTouchMs[0] = now;
  }
}
void IRAM_ATTR touch2ISR() {
  unsigned long now = millis();
  if (now - lastTouchMs[1] > TOUCH_DEBOUNCE_MS) {
    touchPending[1] = true;
    lastTouchMs[1] = now;
  }
}
void IRAM_ATTR touch3ISR() {
  unsigned long now = millis();
  if (now - lastTouchMs[2] > TOUCH_DEBOUNCE_MS) {
    touchPending[2] = true;
    lastTouchMs[2] = now;
  }
}
void IRAM_ATTR touch4ISR() {
  unsigned long now = millis();
  if (now - lastTouchMs[3] > TOUCH_DEBOUNCE_MS) {
    touchPending[3] = true;
    lastTouchMs[3] = now;
  }
}

// Toggle the given relay and push the new state to Firebase
void toggleRelay(uint8_t relayPin, const char* fbPath) {
  bool currentOn = (digitalRead(relayPin) == LOW);
  digitalWrite(relayPin, currentOn ? HIGH : LOW);
  if (Firebase.ready()) {
    Firebase.RTDB.setBool(&fbdo, fbPath, !currentOn);
  }
}

void setup() {
  Serial.begin(115200);

  // Setup relay pins (active LOW — HIGH = OFF)
  pinMode(RELAY1, OUTPUT); digitalWrite(RELAY1, HIGH);
  pinMode(RELAY2, OUTPUT); digitalWrite(RELAY2, HIGH);
  pinMode(RELAY3, OUTPUT); digitalWrite(RELAY3, HIGH);
  pinMode(RELAY4, OUTPUT); digitalWrite(RELAY4, HIGH);

  // Setup touch input pins
  pinMode(TouchPin1, INPUT_PULLUP);
  pinMode(TouchPin2, INPUT_PULLUP);
  pinMode(TouchPin3, INPUT_PULLUP);
  pinMode(TouchPin4, INPUT_PULLUP);

  // FALLING-edge interrupts — fire the instant TTP223 detects a touch
  attachInterrupt(digitalPinToInterrupt(TouchPin1), touch1ISR, FALLING);
  attachInterrupt(digitalPinToInterrupt(TouchPin2), touch2ISR, FALLING);
  attachInterrupt(digitalPinToInterrupt(TouchPin3), touch3ISR, FALLING);
  attachInterrupt(digitalPinToInterrupt(TouchPin4), touch4ISR, FALLING);

  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }
  Serial.println(" Connected!");

  config.api_key = API_KEY;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;
  config.database_url = DATABASE_URL;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

unsigned long lastFirebasePoll = 0;
const unsigned long FIREBASE_POLL_INTERVAL = 500; // ms

void loop() {
  // Process any touch flags set by ISRs (captures briefest taps reliably)
  if (touchPending[0]) { touchPending[0] = false; toggleRelay(RELAY1, "/relay1"); }
  if (touchPending[1]) { touchPending[1] = false; toggleRelay(RELAY2, "/relay2"); }
  if (touchPending[2]) { touchPending[2] = false; toggleRelay(RELAY3, "/relay3"); }
  if (touchPending[3]) { touchPending[3] = false; toggleRelay(RELAY4, "/relay4"); }

  // Poll Firebase periodically so changes from the web dashboard apply
  if (Firebase.ready() && (millis() - lastFirebasePoll >= FIREBASE_POLL_INTERVAL)) {
    lastFirebasePoll = millis();

    if (Firebase.RTDB.getBool(&fbdo, "/relay1"))
      digitalWrite(RELAY1, fbdo.boolData() ? LOW : HIGH);

    if (Firebase.RTDB.getBool(&fbdo, "/relay2"))
      digitalWrite(RELAY2, fbdo.boolData() ? LOW : HIGH);

    if (Firebase.RTDB.getBool(&fbdo, "/relay3"))
      digitalWrite(RELAY3, fbdo.boolData() ? LOW : HIGH);

    if (Firebase.RTDB.getBool(&fbdo, "/relay4"))
      digitalWrite(RELAY4, fbdo.boolData() ? LOW : HIGH);
  }
}
