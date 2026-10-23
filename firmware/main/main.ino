// 샘플 스케치: 버튼(D2)을 누르면 LED(D13) 토글, 상태를 시리얼로 출력.
// 실제 수행평가 주제가 정해지면 이 파일을 교체한다.
const int LED_PIN = 13;
const int BUTTON_PIN = 2;

bool ledOn = false;
bool lastPressed = false;

void setup() {
  Serial.begin(9600);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.println("READY");
}

void loop() {
  bool pressed = digitalRead(BUTTON_PIN) == LOW;
  if (pressed && !lastPressed) {
    ledOn = !ledOn;
    digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
    Serial.println(ledOn ? "LED ON" : "LED OFF");
    delay(30);
  }
  lastPressed = pressed;
}
