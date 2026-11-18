import { test, expect } from '@playwright/test'

test('live procedure and conditional documents render from DB without marking them all mandatory', async ({page,request}) => {
  const response = await request.get('/api/v1/housing/policies')
  expect(response.ok()).toBeTruthy()
  const {data}=await response.json()
  const policy=data.find((p:any)=>p.title==='신혼부부전용 전세자금대출')
  expect(policy.application_process.length).toBeGreaterThan(1)
  expect(policy.required_documents.some((d:any)=>d.required===false)).toBeTruthy()
  await page.goto('/policies/'+policy.policy_id)
  await expect(page.getByRole('heading',{name:policy.title,exact:true})).toBeVisible()
  await expect(page.getByText(policy.application_process[0],{exact:true})).toBeVisible()
  const required=policy.required_documents.find((d:any)=>d.required===true),conditional=policy.required_documents.find((d:any)=>d.required===false)
  const button=page.getByRole('button',{name:conditional.name+' 준비 여부',exact:true})
  await expect(button).toContainText('해당자만 제출')
  await expect(page.getByRole('button',{name:required.name+' 준비 여부',exact:true})).toContainText('필수')
  await expect(page.getByText('[object Object]',{exact:false})).toHaveCount(0)
  for(const width of [320,390,480]){
    await page.setViewportSize({width,height:844})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy()
    await button.scrollIntoViewIfNeeded()
    await page.screenshot({path:`test-results/application-info-${width}.png`})
  }
  await button.click();await expect(page.getByRole('dialog')).toBeVisible()
  await expect(button).toHaveAttribute('aria-pressed','false')
})

test('own preparation check uses the official key and survives reload in detail and My', async ({page,request})=>{
  const {data}=await(await request.get('/api/v1/housing/policies')).json()
  const policy=data.find((p:any)=>p.title==='신혼부부전용 전세자금대출'),document=policy.required_documents.find((d:any)=>d.required===false)
  const uid='11111111-1111-4111-8111-111111111111',user={id:uid,email:'documents-test@example.com',aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{},created_at:new Date().toISOString()}
  const token=[{alg:'HS256',typ:'JWT'},{sub:uid,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600},'test'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.')
  let checks:any[]=[]
  await page.route('**/api/v1/housing/policies',route=>route.fulfill({json:{success:true,data}}))
  await page.route('**/auth/v1/**',route=>route.fulfill({json:route.request().url().includes('/token')?{access_token:token,refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user}:user}))
  await page.route('**/api/v1/me/**',route=>{
    const req=route.request(),url=new URL(req.url())
    expect(req.headers().authorization).toBe('Bearer '+token)
    if(url.pathname.endsWith('/workspace'))return route.fulfill({json:{success:true,data:{bookmarks:[],recent:[],profile:null,documents:checks,tasks:[],applications:[{application_id:'22222222-2222-4222-8222-222222222222',policy_id:policy.policy_id,user_id:uid,stage:'PREPARING',policy}]}}})
    if(url.pathname.includes('/documents/')){const body=req.postDataJSON();expect(body.docKey).toBe(document.key);checks=[{policy_id:policy.policy_id,user_id:uid,doc_key:body.docKey,is_checked:body.isChecked}];return route.fulfill({json:{success:true,data:null}})}
    return route.fulfill({json:{success:true,data:null}})
  })
  await page.goto('/my');await page.getByRole('button',{name:'로그인하기 ›'}).click()
  await page.getByLabel('이메일',{exact:true}).fill(user.email);await page.getByLabel('비밀번호',{exact:true}).fill('mock-password')
  await page.getByRole('dialog').getByRole('button',{name:'로그인',exact:true}).click()
  await expect(page.getByRole('heading',{name:policy.title,exact:true})).toBeVisible()
  await page.goto('/policies/'+policy.policy_id)
  const button=page.getByRole('button',{name:document.name+' 준비 여부',exact:true})
  await expect(button).toHaveAttribute('aria-pressed','false');await button.click()
  await expect(button).toHaveAttribute('aria-pressed','true')
  await page.reload();await expect(button).toHaveAttribute('aria-pressed','true')
  await page.goto('/my');await page.getByRole('heading',{name:policy.title,exact:true}).click()
  await page.getByRole('button',{name:/나머지 .*개 더보기/}).click()
  await expect(page.getByRole('checkbox',{name:document.name+' 준비 여부',exact:true})).toBeChecked()
  await expect(page.getByText('해당자만 제출 · 본인에게 적용되는 조건인지 확인해주세요.').first()).toBeVisible()
})
