import {test,expect} from '@playwright/test'
import {workspaceEvents} from '../src/data/workspaceCalendar'
import type {ApplicationItem} from '../src/app/AppState'
import type {PolicyCatalogItem} from '../src/data/policies'
const p={id:'policy',title:'테스트 정책',applicationEndDate:'2026-11-20'} as PolicyCatalogItem
const a={id:'application',policyId:p.id,policyName:p.title,stage:'신청 준비',applicationDeadline:'2026-11-20',applicationDate:'',expectedResultDate:''} as ApplicationItem
test('bookmark and preparation share one deadline; applied and result events stay distinct',()=>{
 expect(workspaceEvents([p.id],[a],[p])).toHaveLength(1)
 const events=workspaceEvents([p.id],[{...a,stage:'신청 완료',applicationDate:'2026-11-18',expectedResultDate:'2026-11-20'}],[p])
 expect(events.map(e=>e.kind)).toEqual(['신청 완료','결과 발표']);expect(events.some(e=>e.kind==='신청 마감')).toBeFalsy()
})
test('unknown dates create no fake event; edited result replaces the previous date',()=>{
 const unknown={...a,stage:'신청 완료' as const,expectedResultDate:'미정'}
 expect(workspaceEvents([], [unknown], [p])).toHaveLength(0)
 const edited=workspaceEvents([],[{...unknown,expectedResultDate:'2026-12-02'}],[p])
 expect(edited).toHaveLength(1);expect(edited[0].date).toBe('2026-12-02')
 const manual={...a,id:'manual-fixture',policyId:'manual-fixture'}
 expect(workspaceEvents([],[manual],[])[0].policyId).toBeUndefined()
})
