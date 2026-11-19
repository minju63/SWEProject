const usernamePattern=/^[a-z][a-z0-9]{7,14}$/;
const nicknamePattern=/^[가-힣a-zA-Z0-9]{2,10}$/;
const passwordPattern=/^(?=.{8,15}$)(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=])[A-Za-z\d!@#$%^&*()_+\-=]+$/;
function signupErrors(input){
 /** @type {Record<string,string>} */
 const errors={};
 if(!usernamePattern.test(String(input.username||'').toLowerCase()))errors.username='아이디는 영문 소문자로 시작하는 8~15자의 영문 소문자·숫자로 입력해주세요.';
 if(!nicknamePattern.test(input.nickname||''))errors.nickname='닉네임은 한글·영문·숫자 2~10자로 입력해주세요.';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email||''))errors.email='올바른 이메일을 입력해주세요.';
 if(!passwordPattern.test(input.password||''))errors.password='비밀번호는 8~15자로 영문·숫자·허용 특수문자를 포함해주세요.';
 if(input.password!==input.confirmation)errors.confirmation='비밀번호가 서로 다릅니다.';
 if(input.ageConfirmed!==true)errors.ageConfirmed='만 14세 이상 확인이 필요해요.';
 if(input.terms!==true||input.privacy!==true)errors.consents='필수 약관에 동의해주세요.';
 if(typeof input.personalization!=='boolean')errors.consents='맞춤정보 수집·이용 동의 여부를 선택해주세요.';
 return errors;
}
function birthDateError(value,today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)return '생년월일을 YYYY-MM-DD 형식으로 입력해주세요.';
 if(value>today)return '오늘 이후의 생년월일은 입력할 수 없어요.';
 const age=Number(today.slice(0,4))-Number(value.slice(0,4))-(today.slice(5)<value.slice(5)?1:0);
 return age<14?'만 14세 이상만 이용할 수 있어요.':null;
}
export default {usernamePattern,nicknamePattern,passwordPattern,signupErrors,birthDateError};
