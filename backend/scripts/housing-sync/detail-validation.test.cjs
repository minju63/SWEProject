const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateHousingDetail:validate}=require('./detail-validation.cjs');
const context=v=>({value:v,status:'CONFIRMED',conditions:'원문 연 대출금리',unit:'percent_per_year',scope:'해당 상품',source_urls:['https://example.org/official']});
test('official zero interest requires evidence; zero money and fractional counts are rejected',()=>{
 assert.throws(()=>validate({interest_rate:0}),/context/);assert.doesNotThrow(()=>validate({interest_rate:0},{interest_rate:context(0)}));
 for(const d of [{monthly_amount:0},{support_months:1.5},{supply_units:NaN},{deposit_max:-1}])assert.throws(()=>validate(d),/NULL/);
});
test('strict staging requires matching value and rejects supply area in eligibility cap',()=>{
 assert.throws(()=>validate({supply_units:144},{},{requireContext:true}),/context/);
 assert.throws(()=>validate({interest_rate:0},{interest_rate:context(1)}),/context/);
 assert.throws(()=>validate({exclusive_area_max:44.88},{exclusive_area_max:{...context(44.88),meaning:'supply_area'}}),/Supply area/);
 assert.doesNotThrow(()=>validate({supply_units:144},{supply_units:{...context(144),unit:'housing_units'}} ,{requireContext:true}));
});
