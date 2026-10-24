"""Reproducible rigid-body/beam estimates; NOT FEA or measured load certification."""
import json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=json.loads((ROOT/'models/robot_v4/parameters.json').read_text())
T=.10  # N m: specified bench proof load, NOT a guaranteed motor torque limit
r=p['pitch_mm']/1000; dia=p['pin_mm']/1000
F=T/r
lever=(5+p['pin_engagement_mm'])/1000
E_steel=200e9; G_steel=79e9; E_al=69e9; G_al=26e9
side=p['lock_bar_mm']/1000; length=p['lock_length_mm']/1000
J=.1406*side**4; I=side**4/12
square_play=lambda bore,bar:math.degrees(math.asin(bore/(math.sqrt(2)*bar))-math.pi/4)
steel_twist=math.degrees(T*length/(G_steel*J))
# Cast against the actual bar: 0.02..0.04 mm total measured across-flats clearance.
fit_max=.04
oneway=square_play(p['lock_bar_mm']+fit_max,p['lock_bar_mm'])
eng=p['pin_engagement_mm']-p['pin_tip_h_mm']-(p['socket_countersink_mm']-p['socket_mm'])/2
span=(174-(-(p['cube_mm']/2+p['lock_tip_y_mm'])))/1000
link=p['link_mm']/1000; crank=p['crank_r_mm']/1000
forces=[]
for deg in (5,10,30,90):
    a=math.radians(deg)
    dz=crank*math.sin(a)+crank**2*math.sin(a)*math.cos(a)/math.sqrt(link**2-(crank*math.sin(a))**2)
    forces.append({'theta_deg':deg,'dz_dtheta_mm_per_rad':dz*1000,'force_N_at_1Nm_servo':1/abs(dz)})
manufacturing=json.loads((ROOT/'models/robot_v4/manufacturing.json').read_text())
cube_names={'cube_core','cube_center','center_recessed','cube_edge','cube_corner'}
cube_volume=sum(v['volume_mm3']*v['qty'] for n,v in manufacturing['print_parts'].items() if n in cube_names)
# Solid PETG envelope plus a conservative 30 g allowance for screws/springs/stickers.
cube_mass=cube_volume*1.27e-6+.030
accel_bound=(math.pi/100)*(.0001/.008**3)
layer_inertia=(cube_mass/3)*(2*(p['cube_mm']/1000)**2)/12
report={
 'analytical_checks_passed':True,'physical_load_test_passed':None,
 'assumptions':{'proof_torque_Nm':T,'steel_E_Pa':E_steel,'steel_G_Pa':G_steel,'aluminum_E_Pa':E_al,'aluminum_G_Pa':G_al,
                'print_material_strength_assumed':False,'casting_clearance_total_mm':[.02,.04]},
 'pin':{'balanced_load_N':F/2,'one_pin_load_N':F,'worst_bending_stress_MPa':32*F*lever/(math.pi*dia**3)/1e6,
        'worst_tip_deflection_mm':F*lever**3/(3*E_steel*(math.pi*dia**4/64))*1000,
        'straight_engagement_mm':eng,'average_bore_pressure_one_pin_MPa':F/(p['pin_mm']*eng),
        'nominal_oneway_clearance_deg':math.degrees((p['socket_mm']-p['pin_mm'])/2/p['pitch_mm'])},
 'lock':{'original_oneway_socket_play_deg':square_play(p['lock_socket_mm'],p['lock_bar_mm']),
         'steel_twist_deg_at_proof_load':steel_twist,'aluminum_twist_deg_at_proof_load':math.degrees(T*length/(G_al*J)),
         'steel_bending_tip_mm_at_0p1Nm':T*span**2/(2*E_steel*I)*1000,
         'cast_socket_oneway_play_max_deg':oneway,'cast_plus_steel_twist_max_deg':oneway+steel_twist,
         'scope':'Square-socket play + steel shaft elasticity only; cradle, inserts, epoxy and core key compliance excluded.'},
 'servo':{'near_dead_center_samples':forces,'dead_center_force_bound_N':None,
          'finding':'Position/limit switches do not measure force. Rigid slider-crank mechanical advantage diverges at dead centre.'},
 'gravity_inertia':{'solid_cube_volume_mm3':cube_volume,'cube_mass_upper_assumption_kg':cube_mass,
                    'cube_weight_N':cube_mass*9.81,'ramp_acceleration_bound_rad_s2':accel_bound,
                    'one_layer_inertial_torque_Nm':layer_inertia*accel_bound,
                    'scope':'Solid PETG density1.27 plus30g hardware; not measured. Acceleration estimate excludes step ripple/start impulse.'},
 'torque_sweep':[{'torque_Nm':t,'one_pin_pressure_MPa':t/r/(p['pin_mm']*eng),
                  'socket_fit_plus_steel_twist_deg':oneway+math.degrees(t*length/(G_steel*J))}for t in (.05,.10,.20,.40)],
 'residuals':['Cast fit and core bedding need measurement after cure; no strength certificate for printed parts.',
              'Servo insertion/jam force is not physically limited; use low-force commissioning and a verified series-elastic/force-limited link before unattended operation.',
              'No encoder detects step loss. Motor dynamic torque, belt tension, creep and wear require bench tests.']}
assert eng>=1.99
assert report['lock']['cast_plus_steel_twist_max_deg']<.5
assert report['pin']['worst_tip_deflection_mm']<.01
out=ROOT/'models/robot_v4/assembly_kit/physics_checks.json'
out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
