import {test, expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('dedicated real account: profile fields, scoped interests, clearing and account view', async ({page,request}) => {
  test.skip(process.env.RUN_MY_LIVE !== '1', 'Uses only the designated test account');
  test.setTimeout(180000);
  page.setDefaultTimeout(12000);
  const credentials=JSON.parse(fs.readFileSync(path.resolve('../.local/test-account.json'),'utf8'));
  await page.goto('/my');await page.getByRole('button',{name:'로그인하기 ›'}).click();
  await page.getByLabel('이메일',{exact:true}).fill(credentials.email);
  await page.getByLabel('비밀번호',{exact:true}).fill(credentials.password);
  await page.getByRole('dialog').getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('계정 데이터를 확인하고 있어요.')).toHaveCount(0);
  const session=await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('sb-') && k.endsWith('-auth-token'))!)!));
  expect(session.user.id).toBe(credentials.user_id);
  expect(session.user.app_metadata.test_account).toBe(true);
  const api=async (url:string,method='GET',data?:any) => {
    const response=await request.fetch('/api/v1/me'+url,{method,data,headers:{Authorization:'Bearer '+session.access_token}});
    expect(response.ok(),url).toBeTruthy();return (await response.json()).data;
  };
  const before=await api('/workspace');
  const metadata=session.user.user_metadata;
  const choose=async(label:string,value:string) => {
    await page.getByText(label,{exact:true}).locator('..').getByRole('button',{expanded:false}).first().click();
    await page.getByRole('option',{name:value,exact:true}).click();
  };
  const clearInterests=async() => {
    for(const name of ['취업·진로','주거·생활','장학·금융','문화','공간·시설']) {
      const button=page.getByRole('button',{name:name+' 전체 선택',exact:true});
      if(await button.getAttribute('aria-pressed')!=='true') await button.click();
      await button.click();
    }
  };
  try {
    await page.goto('/settings?view=profile');
    await expect(page.getByRole('heading',{name:'프로필 및 맞춤정보',exact:true})).toBeVisible();
    await page.getByLabel('이름',{exact:true}).fill('연결검증');
    await page.getByLabel('생년월일',{exact:false}).fill('2001-05-01');
    await choose('시·군·구','사하구');
    await choose('최종학력','고등학교 졸업');
    await choose('현재 상태','대학생');
    await choose('현재 주거 형태','월세');
    await choose('가구 구성','1인 거주');
    await expect(page.getByLabel('이름',{exact:true})).toHaveValue('연결검증');
    await expect(page.getByText('시·군·구',{exact:true}).locator('..').getByRole('button')).toContainText('사하구');
    await clearInterests();
    await page.getByRole('button',{name:'장학·금융 전체 선택',exact:true}).click();
    const finance=page.locator('[data-interest="장학·금융"]'),culture=page.locator('[data-interest="문화"]');
    await finance.getByRole('button',{name:'장학·금융',exact:true}).click();
    await finance.getByRole('button',{name:'기타',exact:true}).click();
    await culture.getByRole('button',{name:'문화',exact:true}).click();
    await culture.getByRole('button',{name:'기타',exact:true}).click();
    await page.getByRole('button',{name:'변경사항 저장',exact:true}).click();
    await expect(page.getByRole('heading',{name:'설정',exact:true})).toBeVisible();
    console.log('Profile form saved to real DB');
    let workspace=await api('/workspace');
    expect(workspace.profile.interest_categories).toEqual(['장학·금융','문화']);
    expect(workspace.profile.region_code).toBe('26380');
    expect(workspace.profile.housing_type).toBe('월세');
    expect(workspace.profile.final_education).toBe('고등학교 졸업');
    await page.goto('/my');
    await expect(page.getByRole('heading',{name:'연결검증님',exact:true})).toBeVisible();
    await expect(page.getByText('맞춤정보 100%',{exact:true})).toBeVisible();
    await expect(page.getByText('#장학·금융',{exact:true})).toBeVisible();
    await page.reload();
    await expect(page.getByText('#문화',{exact:true})).toBeVisible();
    await page.goto('/settings?view=profile');
    await finance.getByRole('button',{name:'장학·금융',exact:true}).click();
    await expect(finance.getByRole('button',{name:'기타',exact:true})).toHaveAttribute('aria-pressed','false');
    await culture.getByRole('button',{name:'문화',exact:true}).click();
    await expect(culture.getByRole('button',{name:'기타',exact:true})).toHaveAttribute('aria-pressed','true');
    console.log('Interest detail selections survived reload');
    await page.getByLabel('생년월일',{exact:false}).fill('');
    await choose('시·군·구','선택 안 함');
    for(const label of ['최종학력','현재 상태','현재 주거 형태','가구 구성','독립거주 여부','주택 소유 여부','세대주 여부','주거급여 수급 여부','재직 기업 유형']) await choose(label,'선택하지 않음');
    await clearInterests();
    for(const button of await page.getByRole('group',{name:'혼인 상태',exact:true}).getByRole('button',{pressed:true}).all()) await button.click();
    for(const button of await page.getByRole('group',{name:'특화대상',exact:true}).getByRole('button',{pressed:true}).all()) await button.click();
    await page.getByRole('button',{name:'변경사항 저장',exact:true}).click();
    await expect(page.getByRole('heading',{name:'설정',exact:true})).toBeVisible();
    workspace=await api('/workspace');
    for(const key of ['birth_date','region_code','final_education','housing_type','household_type','lives_separately','marital_status','home_ownership','household_role','housing_benefit_status']) expect(workspace.profile[key],key).toBeNull();
    expect(workspace.profile.interest_categories).toEqual([]);
    expect(workspace.profile.current_status).toEqual([]);
    expect(workspace.profile.special_targets).toEqual([]);
    await page.goto('/my');await expect(page.getByText('맞춤정보 0%',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'설정 열기'}).click();
    await page.getByRole('button',{name:'계정 설정',exact:true}).click();
    await expect(page.getByText(credentials.email,{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'회원 탈퇴',exact:true}).click();
    await expect(page.getByRole('button',{name:'회원 탈퇴 계속하기',exact:true})).toBeDisabled();
    await page.getByRole('checkbox').check();
    await expect(page.getByRole('button',{name:'회원 탈퇴 계속하기',exact:true})).toBeEnabled();
    // Do not submit withdrawal: its deletion path is checked with isolated backend fixtures.
    console.log('Real DB profile, scoped interest details, clearing optional values, completion and account UI verified');
  } finally {
    const allowed=['birth_date','region_code','residence_months','final_education','current_status','interest_categories','housing_type','household_type','lives_separately','marital_status','home_ownership','household_role','housing_benefit_status','special_targets'];
    await api('/profile','PUT',Object.fromEntries(allowed.filter(k=>before.profile && k in before.profile).map(k=>[k,before.profile[k]])));
    const env=fs.readFileSync(path.resolve('.env'),'utf8');
    const url=env.match(/^VITE_SUPABASE_URL=(.*)$/m)![1].trim().replace(/^['"]|['"]$/g,'');
    const key=env.match(/^VITE_SUPABASE_ANON_KEY=(.*)$/m)![1].trim().replace(/^['"]|['"]$/g,'');
    const restored=await request.put(url+'/auth/v1/user',{headers:{Authorization:'Bearer '+session.access_token,apikey:key},data:{data:{display_name:null,profile_preferences:null,...metadata}}});
    expect(restored.ok()).toBeTruthy();
  }
});
