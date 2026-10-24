#include <iostream>
#include <sstream>
#include <algorithm>
#include "../../firmware/main/main.ino"
uint64_t hostUs=0;
int hostPins[32]={},hostServo[32]={},faultUnit=-1,faultWant=0;
std::vector<HostPulse> hostPulses;
std::vector<std::pair<int,int>> hostWrites;
HostSerial Serial;
uint16_t sensorShift=0xFFFF,sensorOverride=0; bool overrideEnabled=false;
void digitalWrite(int p,int v){
  if(p==SENSOR_LOAD_PIN && v==LOW){
    uint8_t en=0xFF,rt=0xFF;
    const int units[6]={0,0,1,1,2,3};
    for(int h=0;h<6;h++){
      int u=units[h];bool engaged=hostServo[SERVO_PINS[u]]==SERVO_ENGAGED_DEG;
      bool bad=(u==faultUnit && engaged==bool(faultWant));
      // A SINGLE head failing to reach an end must block the entire pair.
      if(!bad || (h!=0 && h!=2 && h!=4 && h!=5)){
        if(engaged)en&=~(1<<h);else rt&=~(1<<h);
      }
    }
    sensorShift=overrideEnabled?sensorOverride:(uint16_t(en)<<8)|rt;
  }
  if(p==SENSOR_CLOCK_PIN && v==HIGH && hostPins[p]==LOW)sensorShift=(sensorShift<<1)|1;
  if(v==HIGH && hostPins[p]!=HIGH)
    for(int f=1;f<6;f++)if(STEP_PINS[f]==p)hostPulses.push_back({p,hostPins[DIR_PIN],hostUs});
  hostPins[p]=v;
}
int digitalRead(int p){
  if(p==SENSOR_DATA_PIN)return (sensorShift&0x8000)?HIGH:LOW;
  return hostPins[p];
}
std::string quote(const std::string& s){
  std::string o="\"";for(char c:s){if(c=='\n')o+="\\n";else if(c=='\r')o+="\\r";else if(c=='\t')o+="\\t";else {if(c=='"'||c=='\\')o+='\\';o+=c;}}return o+'"';
}
int main(){
  std::string cmd;
  while(std::getline(std::cin,cmd)){
    Serial.output.clear();hostPulses.clear();hostWrites.clear();uint64_t t0=hostUs;
    if(cmd.rfind("RESET ",0)==0){
      hostUs=0;t0=0;std::fill(hostPins,hostPins+32,HIGH);faultUnit=-1;
      mech=Mechanism();motors=Motors();cube.reset();lineLen=0;lineOverflow=false;
      setup();motors.setEnabled(cmd.substr(6)!="virtual");Serial.output.clear();hostWrites.clear();
    }else if(cmd.rfind("FAULT ",0)==0){std::istringstream in(cmd.substr(6));in>>faultUnit>>faultWant;}
    else if(cmd.rfind("TIMEOUT ",0)==0)mech.sensorTimeoutMs=std::stoi(cmd.substr(8));
    else if(cmd=="LOAD")mech.load();
    else if(cmd=="EJECT")mech.eject();
    else if(cmd=="FLIP")mech.flip();
    else if(cmd.rfind("MOVE ",0)==0){
      uint8_t seq[MAX_MANUAL_MOVES];uint8_t n=parseSeq(cmd.c_str()+5,seq,MAX_MANUAL_MOVES);
      if(!n)Serial.println(F("ERR bad moves"));else execute(seq,n,F("MOVING"));
    }else if(cmd.rfind("RAW ",0)==0){Serial.input=cmd.substr(4)+'\n';pollSerial();}
    else if(cmd.rfind("TURN ",0)==0)motors.turn(std::stoi(cmd.substr(5)));
    else if(cmd=="MOTORFLIP")motors.flip();
    else if(cmd.rfind("CHECK ",0)==0){
      sensorOverride=std::stoul(cmd.substr(6));overrideEnabled=true;uint8_t ok=0;
      for(uint8_t u=0;u<4;u++)for(uint8_t w=0;w<2;w++)if(mech.atEnd(u,w))ok|=1<<(u+4*w);
      Serial.print(F("CHECK "));Serial.println(ok);overrideEnabled=false;
    }
    else return 2;
    std::string trace=Serial.output;Serial.output.clear();mech.printStatus(Serial);
    char fc[55];cube.facelets(fc);
    std::cout<<"{\"trace\":"<<quote(trace)<<",\"state\":"<<quote(Serial.output)<<",\"cube\":"<<quote(fc)<<",\"us\":"<<(hostUs-t0)<<",\"pulses\":[";
    for(size_t i=0;i<hostPulses.size();i++){auto p=hostPulses[i];if(i)std::cout<<',';std::cout<<'['<<p.pin<<','<<p.dir<<','<<(p.at-t0)<<']';}
    std::cout<<"],\"servos\":[";
    for(size_t i=0;i<hostWrites.size();i++){if(i)std::cout<<',';std::cout<<'['<<hostWrites[i].first<<','<<hostWrites[i].second<<']';}
    std::cout<<"]}"<<std::endl;
  }
}
