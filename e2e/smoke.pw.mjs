import { test, expect } from '@playwright/test'

const shots=['establishing','craneIn','bottleneckLow','queueTrack','healHold','pullBack']

test('smoke: no console errors, scenario reveals the floor, no mobile overflow', async ({page})=>{
  const errors=[]
  page.on('console',msg=>{ if(msg.type()==='error') errors.push(msg.text()) })
  page.on('requestfailed',req=>errors.push(`REQUEST FAILED: ${req.url()} ${req.failure()?.errorText??''}`))
  await page.goto('./')
  await expect(page.locator('#floor')).toBeVisible()
  await page.getByRole('button',{name:'Holiday week'}).click()
  await page.getByRole('button',{name:'RUN SCENARIO'}).click()
  await expect(page.locator('.factory-story-callout')).toBeVisible()
  expect(errors).toEqual([])

  await page.setViewportSize({width:390,height:844})
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

for(const viewport of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
  for(const shot of shots){
    test(`shot ${shot} · ${viewport.name}`,async({page})=>{
      await page.setViewportSize({width:viewport.width,height:viewport.height})
      await page.goto(`./?shot=${shot}&freeze=1`)
      await page.locator('#floor').scrollIntoViewIfNeeded()
      await expect(page.locator('.factory-canvas')).toBeVisible()
      await page.waitForTimeout(900)
      const image=await page.locator('.factory-shell').screenshot({path:`test-results/shots/${viewport.name}-${shot}.png`,animations:'disabled'})
      expect(image.byteLength).toBeGreaterThan(10_000)
    })
  }
}
