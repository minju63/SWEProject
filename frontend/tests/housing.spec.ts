import {test,expect} from '@playwright/test'
test('live housing data renders; anonymous private actions require login',async({page,request})=>{
 const response=await request.get('/api/v1/housing/policies');expect(response.ok()).toBeTruthy();const {data}=await response.json();expect(data.length).toBeGreaterThanOrEqual(80)
 const policy=data.find((p:any)=>p.title.includes('청년월세'))||data[0]
 await page.goto('/policies/'+policy.policy_id)
 await expect(page.getByRole('heading',{name:policy.title,exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:policy.title+' 북마크'})).toBeVisible()
 await page.getByRole('button',{name:policy.title+' 북마크'}).click()
 await expect(page.getByRole('dialog')).toBeVisible()
 await page.getByRole('button',{name:'닫기',exact:true}).click()
 await expect(page.getByText('공식 자료에서 제출서류를 확인할 수 없어요.')).toBeVisible()
 await page.screenshot({path:'test-results/housing-detail-live.png',fullPage:true})
 const privateRead=await request.get('/api/v1/me/workspace');expect(privateRead.status()).toBe(401)
 await page.goto('/policies/not-a-real-policy');await expect(page.getByText('정책을 찾을 수 없어요.')).toBeVisible()
})
test('login, bookmark, recent, application and logout stay connected by policy UUID',async({page,request})=>{
 const {data}=await (await request.get('/api/v1/housing/policies')).json();const policy=data.find((p:any)=>p.title.includes('청년월세'))||data[0]
 // Keep the real policy fixture stable while testing mocked account operations across reloads.
 await page.route('**/api/v1/housing/policies',route=>route.fulfill({json:{success:true,data}}))
 const uid='11111111-1111-4111-8111-111111111111',email='ui-test@example.com';let bookmarks:any[]=[],recent:any[]=[],applications:any[]=[]
 const user={id:uid,aud:'authenticated',role:'authenticated',email,user_metadata:{},app_metadata:{provider:'email'},created_at:new Date().toISOString()}
 const token=[{alg:'HS256',typ:'JWT'},{sub:uid,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600},'test-signature'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.')
 await page.route('**/auth/v1/**',async route=>{const url=route.request().url();if(url.includes('/token'))return route.fulfill({json:{access_token:token,refresh_token:'mock-refresh-token',token_type:'bearer',expires_in:3600,user}});if(url.includes('/logout'))return route.fulfill({status:204,body:''});return route.fulfill({json:user})})
 await page.route('**/api/v1/me/**',async route=>{const req=route.request(),url=new URL(req.url()),body=req.postDataJSON();expect(req.headers().authorization).toBe('Bearer '+token)
  if(url.pathname.endsWith('/workspace'))return route.fulfill({json:{success:true,data:{bookmarks,recent,applications,profile:null,documents:[],tasks:[]}}})
  if(url.pathname.endsWith('/bookmarks')&&req.method()==='POST'){expect(body.policyId).toBe(policy.policy_id);bookmarks=[{policy_id:body.policyId,policy}];return route.fulfill({json:{success:true,data:{}}})}
  if(url.pathname.includes('/recent/')){recent=[{policy_id:policy.policy_id,policy}];return route.fulfill({json:{success:true,data:{}}})}
  if(url.pathname.endsWith('/applications')&&req.method()==='POST'){applications=[{application_id:'22222222-2222-4222-8222-222222222222',policy_id:body.policyId,stage:'PREPARING',policy}];return route.fulfill({json:{success:true,data:applications[0]}})}
  if(url.pathname.includes('/applications/')&&req.method()==='PATCH'){Object.assign(applications[0],body);return route.fulfill({json:{success:true,data:applications[0]}})}
  return route.fulfill({json:{success:true,data:null}})
 })
 await page.goto('/policies/'+policy.policy_id);await page.getByRole('button',{name:policy.title+' 북마크'}).click()
 await page.getByLabel('이메일', {exact:true}).fill(email);await page.getByLabel('비밀번호',{exact:true}).fill('mock-password-not-real')
 await page.getByRole('dialog').getByRole('button',{name:'로그인',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText('계정 데이터를 확인하고 있어요.')).toHaveCount(0)
 await page.getByRole('button',{name:policy.title+' 북마크'}).click();await expect.poll(()=>bookmarks.length).toBe(1);await expect(page.getByText('계정 데이터를 확인하고 있어요.')).toHaveCount(0)
 await page.getByRole('button',{name:'＋ 신청 관리에 추가',exact:true}).click();await expect.poll(()=>applications.length).toBe(1);await expect(page.getByRole('button',{name:'✓ 신청 관리에 추가됨'})).toBeVisible()
 await page.goto('/my');await expect(page.getByRole('heading',{name:policy.title,exact:true}).last()).toBeVisible();await page.screenshot({path:'test-results/my-connected.png',fullPage:true})
 await page.getByRole('heading',{name:policy.title,exact:true}).last().click();await expect(page).toHaveURL(new RegExp('/policies/'+policy.policy_id))
 await page.reload();await expect(page.getByRole('button',{name:'✓ 신청 관리에 추가됨'})).toBeVisible()
 await page.goto('/my');await page.getByRole('button',{name:'설정 열기'}).click();await page.getByRole('button',{name:'로그아웃',exact:true}).click();await page.getByRole('button',{name:'로그아웃',exact:true}).last().click();await page.goto('/my');await expect(page.getByRole('heading',{name:policy.title,exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'로그인하기 ›'})).toBeVisible();await expect(page.getByText('아직 찜한 혜택이 없어요.')).toBeVisible()
})

test('My mock layout keeps profile directly below header at phone widths', async({page})=>{
 for(const width of [320,390,480]){
  await page.setViewportSize({width,height:844});await page.goto('/my')
  const login=page.getByRole('button',{name:'로그인하기 ›'});await expect(login).toBeVisible()
  const header=await page.getByRole('heading',{name:'마이',exact:true}).evaluate(el=>el.closest('header')!.getBoundingClientRect().bottom)
  const profile=await login.boundingBox();expect(profile!.y-header).toBeLessThan(40)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy()
  await expect(page.getByRole('heading',{name:'내 신청 관리'})).toBeVisible()
  await page.screenshot({path:`test-results/my-mock-${width}.png`,fullPage:true})
 }
 await page.getByRole('button',{name:'로그인하기 ›'}).click();await expect(page.getByRole('dialog')).toBeVisible()
})
