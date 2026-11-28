// V5H 모터 단독 시험: 시리얼로 입력한 각도만큼 서보 2개·스텝모터를 움직인다.
// 핀은 v5/firmware/main 과 같다: 스텝 STEP=D2 DIR=D7 EN=D6 (A4988, 1/4 마이크로스텝), 후드 서보 D8, 리프터 서보 D9.
// 시리얼 모니터 115200, 줄 끝 "Newline".
//   h 75    후드 서보를 75°로 (천천히 이동)       본 펌웨어 값: CLOSE 15 · OPEN 75 · FLIP 105 · LOAD 135
//   l 50 400  리프터(360° 연속회전 서보)를 속도 +50 으로 400 ms 돌리고 멈춤. 속도 -100~100 (부호 = 방향, 0 = 정지)
//   l 0     리프터 정지 / z 3  정지점 보정(90 대신 93 을 정지로 씀, 멈춰도 살살 돌면 조정)
//           ※ 연속회전 서보는 각도가 아니라 '속도'를 받는다. 위치를 모르므로 시간으로만 움직인다.
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
int hood_deg=75;                        // 전원 켤 때 이 각도로 붙는다 (본 펌웨어 시작 자세)
int lift_stop=90;                       // 연속회전 서보 정지 펄스(°). 서보마다 88~92 쯤에서 멈춘다
int lift_speed=0;
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

void lift_run(int speed,long ms){
  if(speed<-100) speed=-100;
  if(speed>100) speed=100;
  lift_speed=speed;
  lift.write(lift_stop+speed*90/100);
  if(ms>0){
    delay(ms);
    lift_speed=0;
    lift.write(lift_stop);
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
  Serial.print(F(" lift_speed="));Serial.print(lift_speed);
  Serial.print(F(" lift_stop="));Serial.print(lift_stop);
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
  lift.write(lift_stop);                // 연속회전: 정지 펄스로 시작
  hood.attach(hood_pin);
  lift.attach(lift_pin);
  Serial.println(F("READY  h <deg> | l <speed> [ms] | z <trim> | s <deg> | o | e | p"));
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
  else if(c=='l'){
    String rest=line.substring(1);
    rest.trim();
    int sp=rest.indexOf(' ');
    long ms=0;
    if(sp>0) ms=rest.substring(sp+1).toInt();
    lift_run((int)v,ms);
  }
  else if(c=='z'){ lift_stop=90+(int)v; lift.write(lift_stop); lift_speed=0; }
  else if(c=='s') cup_turn(v);
  else if(c=='o'){ digitalWrite(en_pin,HIGH); motor_on=false; }
  else if(c=='e'){ digitalWrite(en_pin,LOW); motor_on=true; }
  else if(c!='p'){ Serial.println(F("ERR  h <deg> | l <speed> [ms] | z <trim> | s <deg> | o | e | p")); return; }
  print_state();
}
