// 샘플 스케치: 버튼(D2)을 누르면 LED(D13) 토글, 상태를 시리얼로 출력.
// 실제 수행평가 주제가 정해지면 이 파일을 교체한다.
const int LED_PIN = 13;
const int BUTTON_PIN = 2;
const unsigned long DEBOUNCE_MS = 30;  // 입력이 이 시간 동안 변하지 않아야 확정

bool ledOn = false;
bool lastReading = false;    // 직전 loop의 원시 입력 (채터링 포함)
bool stablePressed = false;  // 디바운스된 버튼 상태
unsigned long lastChangeMs = 0;

void setup() {
  Serial.begin(9600);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.println("READY");
}

void loop() {
  bool reading = digitalRead(BUTTON_PIN) == LOW;
  if (reading != lastReading) {
    lastChangeMs = millis();
    lastReading = reading;
  }

  if (millis() - lastChangeMs >= DEBOUNCE_MS && reading != stablePressed) {
    stablePressed = reading;
    if (stablePressed) {
      ledOn = !ledOn;
      digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
      Serial.println(ledOn ? "LED ON" : "LED OFF");
    }
  }
}
