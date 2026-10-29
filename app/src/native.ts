import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { LocalNotificationsPlugin } from '@capacitor/local-notifications';
export const isNative = Capacitor.isNativePlatform();
// Typed native proxies. Plugins are installed by cap sync from package.json.
// Browser previews deliberately use local equivalents and never pretend to schedule iOS reminders.
const Preferences = registerPlugin<{ get(o: {key:string}):Promise<{value:string|null}>; set(o:{key:string;value:string}):Promise<void>; remove(o:{key:string}):Promise<void> }>('Preferences');
const Geolocation = registerPlugin<{ requestPermissions():Promise<{location:string}>; getCurrentPosition(o:object):Promise<{coords:{latitude:number;longitude:number}}> }>('Geolocation');
const Share = registerPlugin<{ share(o:{title:string;text:string;url:string;dialogTitle:string}):Promise<void> }>('Share');
export const Notifications = registerPlugin<LocalNotificationsPlugin>('LocalNotifications');
export const NativeApp = registerPlugin<{ addListener(event:string, cb:()=>void):Promise<PluginListenerHandle> }>('App');
export const CityMap = registerPlugin<{ present(o:{cities:{key:string;name:string;count:number;lat:number;lng:number}[];selected?:string}):Promise<{cityKey?:string}> }>('BookishMap');
export async function readStore<T>(key:string, fallback:T):Promise<T> {
  try { const raw = isNative ? (await Preferences.get({key:`bookish.${key}`})).value : localStorage.getItem(`bookish.${key}`); return raw == null ? fallback : JSON.parse(raw); } catch { return fallback; }
}
export async function writeStore(key:string, value:unknown) {
  const raw = JSON.stringify(value);
  if (isNative) await Preferences.set({key:`bookish.${key}`,value:raw});
  else localStorage.setItem(`bookish.${key}`,raw);
}
export async function locate() {
  if (isNative) {
    const p = await Geolocation.requestPermissions();
    if (p.location !== 'granted') throw new Error('Pick a city below to find your next book club. Location can be enabled in Settings.');
    const { coords } = await Geolocation.getCurrentPosition({enableHighAccuracy:false,timeout:12000,maximumAge:300000});
    return {lat:coords.latitude,lng:coords.longitude};
  }
  return new Promise<{lat:number;lng:number}>((resolve,reject) => navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude}),()=>reject(new Error('Pick a city below to find your next book club.')), {enableHighAccuracy:false,timeout:12000}));
}
export async function shareClub(title:string,url:string) {
  if (isNative) await Share.share({title,text:`Pull up a chair at ${title}.`,url,dialogTitle:'Share this club'});
  else if (navigator.share) await navigator.share({title,url});
  else { await navigator.clipboard.writeText(url); return 'Club link copied. Pass it on!'; }
}
export async function remoteJSON(url:string, body?:unknown) {
  if (isNative) {
    // Native HTTP avoids browser CORS without broadening the edge functions' origin allow-list.
    const response = await CapacitorHttp.request({url,method:body?'POST':'GET',headers:{'Content-Type':'application/json','Accept':'application/json','Cache-Control':'no-cache'},...(body?{data:body}:{}),responseType:'json',connectTimeout:12000,readTimeout:15000});
    return {ok:response.status>=200 && response.status<300,data:response.data};
  }
  const r = await fetch(url,{cache:'no-store',method:body?'POST':'GET',...(body?{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{}),signal:AbortSignal.timeout(15000)});
  return {ok:r.ok,data:await r.json()};
}
