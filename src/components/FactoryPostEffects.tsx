import { Bloom, EffectComposer, N8AO, SMAA, Vignette } from '@react-three/postprocessing'

export default function FactoryPostEffects({quality}:{quality:number}){
  if(quality>=2){
    return <EffectComposer multisampling={0}>
      <N8AO aoRadius={2.2} intensity={1.25} quality="performance" halfRes distanceFalloff={1}/>
      <Bloom intensity={.42} luminanceThreshold={1.08} luminanceSmoothing={.2} mipmapBlur/>
      <SMAA/>
      <Vignette eskil={false} offset={.18} darkness={.38}/>
    </EffectComposer>
  }

  if(quality===1){
    return <EffectComposer multisampling={0}>
      <Bloom intensity={.38} luminanceThreshold={1.1} luminanceSmoothing={.2} mipmapBlur/>
      <SMAA/>
      <Vignette eskil={false} offset={.18} darkness={.32}/>
    </EffectComposer>
  }

  return <EffectComposer multisampling={0}>
    <SMAA/>
    <Vignette eskil={false} offset={.18} darkness={.28}/>
  </EffectComposer>
}
