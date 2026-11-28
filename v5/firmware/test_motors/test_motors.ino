// V5H 모터 단독 시험: 시리얼로 입력한 각도만큼 서보 2개·스텝모터를 움직인다.
// 핀은 v5/firmware/main 과 같다: 스텝 STEP=D2 DIR=D7 EN=D6 (A4988, 1/4 마이크로스텝), 후드 서보 D8, 리프터 서보 D9.
// 시리얼 모니터 115200, 줄 끝 "Newline".
//   h 75    후드 서보를 75°로 (천천히 이동)       본 펌웨어 값: CLOSE 140 · OPEN 70 · FLIP/LOAD 50
//   l 30    리프터 서보를 30°로 (천천히 이동)     본 펌웨어 값: 아래 75 · 위 140
//   s 90    스텝모터(컵)를 +90° (위에서 봐서 시계) / s -90 은 반시계. 1스텝 = 0.45°
//   o       스텝모터 전류 끔 (손으로 컵 돌리기)    / e  다시 켬
//   p       현재 값 출력
#include <Servo.h>

const uint8_t step_pin=2,dir_pin=7,en_pin=6;
const uint8_t hood_pin=8,lift_pin=9;
const int steps_per_rev=200*4;          // 200스텝 모터 × 1/4 마이크로스텝 = 800
const bool cw_level=HIGH;               // 본 펌웨어 CW_LEVEL: DIR 이 HIGH 면 위에서 봐서 시계
const unsigned int step_us=1500;        // 스텝 간격. 탈조하면 키운다

Servo hood,lift;
int hood_deg=70,lift_deg=75;             // 전원 켤 때 이 각도로 붙는다 (본 펌웨어 시작 자세)
long cup_steps=0;
bool motor_on=true;

void servo_to(Servo* sv,int* cur,int target){
  if(target<0) target=0;
  if(target>180) target=180;
  int d=1;
  if(target<*cur) d=-1;
  while(*cur!=target){
    *cur+=d;
    sv->write(*cur);
    delay(8);                           // 1°/8 ms ≈ 125°/s, 부딪혀도 세게 안 치게
  }
}

void cup_turn(float deg){
  long n=lround(deg*steps_per_rev/360.0);
  if(n==0) return;
  if(!motor_on){ digitalWrite(en_pin,LOW); motor_on=true; delay(5); }
  if(n>0) digitalWrite(dir_pin,cw_level);
  else digitalWrite(dir_pin,!cw_level);
  long cnt=labs(n);
  for(long i=0;i<cnt;i++){
    digitalWrite(step_pin,HIGH);
    delayMicroseconds(4);
    digitalWrite(step_pin,LOW);
    delayMicroseconds(step_us);
  }
  cup_steps+=n;
}

void print_state(){
  Serial.print(F("hood="));Serial.print(hood_deg);
  Serial.print(F(" lift="));Serial.print(lift_deg);
  Serial.print(F(" cup="));Serial.print(cup_steps*360.0/steps_per_rev,2);
  Serial.print(F("deg ("));Serial.print(cup_steps);Serial.print(F(" steps)"));
  if(motor_on) Serial.println(F(" motor=ON"));
  else Serial.println(F(" motor=OFF"));
}

void setup(){
  Serial.begin(115200);
  pinMode(step_pin,OUTPUT);
  pinMode(dir_pin,OUTPUT);
  pinMode(en_pin,OUTPUT);
  digitalWrite(en_pin,LOW);             // A4988 EN 은 LOW 가 켜짐
  hood.write(hood_deg);                 // attach 전에 각도를 정해 두면 붙는 순간 90°로 튀지 않는다
  lift.write(lift_deg);
  hood.attach(hood_pin);
  lift.attach(lift_pin);
  Serial.println(F("READY  h <deg> | l <deg> | s <deg> | o | e | p"));
  print_state();
}

void loop(){
  if(!Serial.available()) return;
  String line=Serial.readStringUntil('\n');
  line.trim();
  if(line.length()==0) return;
  char c=tolower(line.charAt(0));
  float v=line.substring(1).toFloat();
  if(c=='h') servo_to(&hood,&hood_deg,(int)v);
  else if(c=='l') servo_to(&lift,&lift_deg,(int)v);
  else if(c=='s') cup_turn(v);
  else if(c=='o'){ digitalWrite(en_pin,HIGH); motor_on=false; }
  else if(c=='e'){ digitalWrite(en_pin,LOW); motor_on=true; }
  else if(c!='p'){ Serial.println(F("ERR  h <deg> | l <deg> | s <deg> | o | e | p")); return; }
  print_state();
}
