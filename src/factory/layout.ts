import type { TrialStationState } from '../sim/types'

export const FLOOR = { width: 25, depth: 16, height: 7 }
export const STATION_SPACING = 4.6

export function stationPosition(index:number): [number,number,number] {
  const row=Math.floor(index/4)
  const col=index%4
  return [(col-1.5)*STATION_SPACING, .42, (row-1)*4.7]
}

export function bottleneckIndex(stations:TrialStationState[]) {
  let best=0
  for(let i=1;i<stations.length;i++){
    const a=stations[i], b=stations[best]
    if(a.throughputFactor < b.throughputFactor || (a.throughputFactor===b.throughputFactor && a.deficit>b.deficit)) best=i
  }
  return best
}
