import {backend,groupOptions} from './backend.js?v=1.3.6';
import {getLocale} from './i18n.js?v=1.3.6';
import {toast,formError} from './notifications.js?v=1.3.6';

const COPY={
  ru:{account:'Аккаунт',profile:'Профиль',teacher:'Преподаватель',student:'Студент',role:'Роль',name:'ФИО',group:'Учебная группа',identifier:'Студенческий билет',email:'Email',save:'Сохранить',saved:'Профиль сохранён',logout:'Выйти',settings:'Настройки курса',close:'Закрыть',saving:'Сохраняем…',ready:'Вы вошли',help:'ФИО и учебную группу можно изменить. Номер билета остаётся прежним.'},
  en:{account:'Account',profile:'Profile',teacher:'Instructor',student:'Student',role:'Role',name:'Full name',group:'Study group',identifier:'Student ID',email:'Email',save:'Save',saved:'Profile saved',logout:'Sign out',settings:'Course settings',close:'Close',saving:'Saving…',ready:'Signed in',help:'You can edit your name and study group. Your student ID remains unchanged.'},
  zh:{account:'账户',profile:'个人资料',teacher:'教师',student:'学生',role:'角色',name:'姓名',group:'班级',identifier:'学号',email:'电子邮箱',save:'保存',saved:'个人资料已保存',logout:'退出登录',settings:'课程设置',close:'关闭',saving:'正在保存……',ready:'已登录',help:'可以修改姓名和班级，学号保持不变。'}
};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy=()=>COPY[getLocale()]||COPY.ru;
function identity(){const teacher=backend.isAdmin();const profile=backend.getProfile();return teacher?{teacher,name:backend.user.displayName||'',email:backend.user.email,uid:backend.user.uid}:profile?{...profile,name:profile.fullName,teacher:false}:null}
function details(user,c){return `<dl class="profile-dl"><dt>${c.name}</dt><dd>${esc(user.name||'—')}</dd><dt>${c.role}</dt><dd>${c[user.teacher?'teacher':'student']}</dd><dt>${c.email}</dt><dd>${esc(user.email)}</dd>${user.teacher?'':`<dt>${c.identifier}</dt><dd>${esc(user.ticket)}</dd><dt>${c.group}</dt><dd>${esc(user.group)}</dd>`}</dl>`}
async function logout(){location.hash='dashboard';await backend.signOut();document.getElementById('accountDialog')?.close()}
export function openAccount(openLogin){
  const user=identity();if(!user){openLogin();return}
  const c=copy();let dialog=document.getElementById('accountDialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='accountDialog';dialog.className='modal';document.body.append(dialog)}
  dialog.innerHTML=`<div class="modal-card compact"><button type="button" class="modal-close" aria-label="${c.close}">×</button><h2>${c.account}</h2><p class="account-role">${c.ready} · ${c[user.teacher?'teacher':'student']}</p>${details(user,c)}<div class="page-actions"><a class="btn btn-primary" href="#profile" id="accountProfile">${c.profile}</a><button class="btn btn-neutral" id="accountLogout">${c.logout}</button></div></div>`;
  dialog.querySelector('.modal-close').onclick=()=>dialog.close();dialog.querySelector('#accountProfile').onclick=()=>dialog.close();dialog.querySelector('#accountLogout').onclick=async event=>{event.currentTarget.disabled=true;try{await logout()}catch(error){toast(error,'error');dialog.querySelector('#accountLogout').disabled=false}};dialog.showModal();
}
export function mountProfile(app){
  const user=identity();if(!user)return false;const c=copy();let group=user.group||'';
  const groups=[...new Set([...groupOptions(),...(group?[group]:[])])];
  app.innerHTML=`<section class="page"><header class="page-head"><h1>${c.profile}</h1>${user.teacher?`<a class="btn btn-neutral" href="#admin">${c.settings}</a>`:''}</header><section class="panel profile-panel">${details(user,c)}${user.teacher?'':`<p class="muted">${c.help}</p>`}<form id="profileEdit" class="form-grid"><label class="full"><span>${c.name}</span><input name="fullName" autocomplete="name" maxlength="150" minlength="2" required value="${esc(user.name)}"></label>${user.teacher?'':`<fieldset class="full"><legend>${c.group}</legend><div class="auth-group-options">${groups.map(value=>`<button type="button" class="auth-group-option ${value===group?'active':''}" data-profile-group="${esc(value)}" aria-pressed="${value===group}">${esc(value)}</button>`).join('')}</div></fieldset>`}<div id="profileError" class="form-error full" hidden></div><div class="page-actions full"><button class="btn btn-primary" type="submit">${c.save}</button><button class="btn btn-neutral" id="profileLogout" type="button">${c.logout}</button></div></form></section></section>`;
  app.querySelectorAll('[data-profile-group]').forEach(button=>button.onclick=()=>{group=button.dataset.profileGroup;app.querySelectorAll('[data-profile-group]').forEach(item=>{item.classList.toggle('active',item.dataset.profileGroup===group);item.setAttribute('aria-pressed',String(item.dataset.profileGroup===group))})});
  const form=app.querySelector('#profileEdit');
  form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;button.textContent=c.saving;
    try{const fullName=new FormData(form).get('fullName');if(user.teacher)await backend.updateTeacherName(fullName);else await backend.saveProfile({identifier:user.ticket,fullName,group});toast(c.saved,'success');mountProfile(app)}catch(error){formError(form.querySelector('#profileError'),error)}finally{button.disabled=false;button.textContent=c.save}
  };
  app.querySelector('#profileLogout').onclick=()=>logout().catch(error=>toast(error,'error'));return true;
}
