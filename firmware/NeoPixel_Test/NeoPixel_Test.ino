/**********************************************************************************
 *  WS2812B Test Sketch — verify all 4 LEDs work before integrating with main code.
 *
 *  Library required: Adafruit NeoPixel
 *    Install via Arduino IDE: Tools → Manage Libraries → search "Adafruit NeoPixel"
 *
 *  Expected behavior after flashing:
 *    1. All 4 LEDs flash RED  for 1 second
 *    2. All 4 LEDs flash GREEN for 1 second
 *    3. All 4 LEDs flash BLUE  for 1 second
 *    4. All 4 LEDs glow WHITE  for 1 second
 *    5. Each LED lights up GREEN one-by-one, then all turn off
 *    Then it loops.
 **********************************************************************************/

#include <Adafruit_NeoPixel.h>

#define LED_PIN    4   // GPIO connected to DI of the first LED (via 470Ω)
#define LED_COUNT  4   // Number of LEDs in the chain

Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

void setup() {
  Serial.begin(115200);
  strip.begin();
  strip.setBrightness(50);   // 0-255 — keep low for testing, white at full is blinding
  strip.show();              // turn all OFF initially
}

void loop() {
  // Flash all LEDs through R, G, B, White
  fillAll(strip.Color(255, 0, 0));   delay(1000);  // Red
  fillAll(strip.Color(0, 255, 0));   delay(1000);  // Green
  fillAll(strip.Color(0, 0, 255));   delay(1000);  // Blue
  fillAll(strip.Color(255, 255, 255)); delay(1000); // White

  // Light each LED one-by-one in green (verifies chain order)
  for (int i = 0; i < LED_COUNT; i++) {
    strip.clear();
    strip.setPixelColor(i, strip.Color(0, 255, 0));
    strip.show();
    delay(500);
  }

  strip.clear();
  strip.show();
  delay(1000);
}

void fillAll(uint32_t color) {
  for (int i = 0; i < LED_COUNT; i++) strip.setPixelColor(i, color);
  strip.show();
}
