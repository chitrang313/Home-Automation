/**********************************************************************************
 *  TITLE: Firebase Web-UI + Manual Button control 4 Relays using ESP32 with Real time feedback
 *  Click on the following links to learn more. 
 *  YouTube Video: https://youtu.be/xIdX0eosdP4
 *  Related Blog : https://iotcircuithub.com/esp32-firebase-iot-home-automation-project/
 *  
 *  This code is provided free for project purpose and fair use only.
 *  Please do mail us to techstudycell@gmail.com if you want to use it commercially.
 *  Copyrighted © by Tech StudyCell
 *  
 *  Preferences--> Aditional boards Manager URLs : 
 *  https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_dev_index.json, http://arduino.esp8266.com/stable/package_esp8266com_index.json
 *  
 *  Download Board ESP32 (3.2.0) : https://github.com/espressif/arduino-esp32
 *  
 *  Download the libraries: 
 *  AceButton Library (1.10.1): https://github.com/bxparks/AceButton
 *  Firebase_ESP_Client by Mobizt (4.4.17): https://github.com/mobizt/Firebase-ESP-Client
 *  ArduinoJson (7.4.1) : https://arduinojson.org/?utm_source=meta&utm_medium=library.properties
 *  
 *  Please Install all the dependency related to these libraries. 

 **********************************************************************************/

#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <AceButton.h>
using namespace ace_button;

// Wi-Fi credentials
const char* ssid = "📡";  //WiFi Name
const char* password = "password";  //WiFi Password

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

// Button GPIOs
#define SwitchPin1 13
#define SwitchPin2 12
#define SwitchPin3 14
#define SwitchPin4 27

// Firebase setup
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// AceButtons
AceButton button1(SwitchPin1);
AceButton button2(SwitchPin2);
AceButton button3(SwitchPin3);
AceButton button4(SwitchPin4);

// Callback for button events
void handleEvent(AceButton* button, uint8_t eventType, uint8_t /* buttonState */) {
  if (eventType != AceButton::kEventReleased) return;

  int id = button->getPin();
  bool currentState;

  switch (id) {
    case SwitchPin1:
      currentState = digitalRead(RELAY1) == LOW; // true if ON
      digitalWrite(RELAY1, currentState ? HIGH : LOW); // toggle
      Firebase.RTDB.setBool(&fbdo, "/relay1", !currentState);
      break;

    case SwitchPin2:
      currentState = digitalRead(RELAY2) == LOW;
      digitalWrite(RELAY2, currentState ? HIGH : LOW);
      Firebase.RTDB.setBool(&fbdo, "/relay2", !currentState);
      break;

    case SwitchPin3:
      currentState = digitalRead(RELAY3) == LOW;
      digitalWrite(RELAY3, currentState ? HIGH : LOW);
      Firebase.RTDB.setBool(&fbdo, "/relay3", !currentState);
      break;

    case SwitchPin4:
      currentState = digitalRead(RELAY4) == LOW;
      digitalWrite(RELAY4, currentState ? HIGH : LOW);
      Firebase.RTDB.setBool(&fbdo, "/relay4", !currentState);
      break;
  }
}


void setup() {
  Serial.begin(115200);

  // Setup relay pins
  pinMode(RELAY1, OUTPUT);
  pinMode(RELAY2, OUTPUT);
  pinMode(RELAY3, OUTPUT);
  pinMode(RELAY4, OUTPUT);

  // Set relays OFF (HIGH for active-low)
  digitalWrite(RELAY1, HIGH);
  digitalWrite(RELAY2, HIGH);
  digitalWrite(RELAY3, HIGH);
  digitalWrite(RELAY4, HIGH);

  // Setup button pins
  pinMode(SwitchPin1, INPUT_PULLUP);
  pinMode(SwitchPin2, INPUT_PULLUP);
  pinMode(SwitchPin3, INPUT_PULLUP);
  pinMode(SwitchPin4, INPUT_PULLUP);

  // Attach AceButtons and set event handler
  ButtonConfig* config1 = button1.getButtonConfig();
  ButtonConfig* config2 = button2.getButtonConfig();
  ButtonConfig* config3 = button3.getButtonConfig();
  ButtonConfig* config4 = button4.getButtonConfig();

  config1->setEventHandler(handleEvent);
  config2->setEventHandler(handleEvent);
  config3->setEventHandler(handleEvent);
  config4->setEventHandler(handleEvent);

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

void loop() {
  // Check Firebase for updates
  if (Firebase.ready()) {
    bool r1, r2, r3, r4;

    if (Firebase.RTDB.getBool(&fbdo, "/relay1")) {
      r1 = fbdo.boolData();
      digitalWrite(RELAY1, r1 ? LOW : HIGH);
    }

    if (Firebase.RTDB.getBool(&fbdo, "/relay2")) {
      r2 = fbdo.boolData();
      digitalWrite(RELAY2, r2 ? LOW : HIGH);
    }

    if (Firebase.RTDB.getBool(&fbdo, "/relay3")) {
      r3 = fbdo.boolData();
      digitalWrite(RELAY3, r3 ? LOW : HIGH);
    }

    if (Firebase.RTDB.getBool(&fbdo, "/relay4")) {
      r4 = fbdo.boolData();
      digitalWrite(RELAY4, r4 ? LOW : HIGH);
    }
  }

  // Update AceButton logic
  button1.check();
  button2.check();
  button3.check();
  button4.check();

  delay(10);  // Short delay for stable button checking
}
