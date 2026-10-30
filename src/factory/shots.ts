export type ShotName='establishing'|'craneIn'|'bottleneckLow'|'queueTrack'|'healHold'|'pullBack'

export interface Shot {
  name:ShotName
  purpose:string
  offset:[number,number,number]
  targetOffset:[number,number,number]
  fov:number
  duration:number
}

export const SHOTS:Record<ShotName,Shot>={
  establishing:{name:'establishing',purpose:'Whole hall context',offset:[13,10,16],targetOffset:[0,0,0],fov:34,duration:1.2},
  craneIn:{name:'craneIn',purpose:'First reveal',offset:[5,17,15],targetOffset:[0,0,0],fov:38,duration:2.5},
  bottleneckLow:{name:'bottleneckLow',purpose:'Constraint close-up',offset:[4.8,2.8,5.4],targetOffset:[0,.45,0],fov:26,duration:1.15},
  queueTrack:{name:'queueTrack',purpose:'Queue propagation',offset:[-7.5,3.7,2.7],targetOffset:[0,.35,0],fov:29,duration:1.25},
  healHold:{name:'healHold',purpose:'Recovery action',offset:[5.6,4.1,5.8],targetOffset:[0,.45,0],fov:27,duration:1.2},
  pullBack:{name:'pullBack',purpose:'Recovered system',offset:[13,9.4,16],targetOffset:[0,0,0],fov:34,duration:1.35},
}

export const RUN_SEQUENCE:ShotName[]=['bottleneckLow','queueTrack','bottleneckLow']
export const HEAL_SEQUENCE:ShotName[]=['healHold','pullBack']
