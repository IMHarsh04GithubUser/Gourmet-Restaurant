export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
export const money = value => new Intl.NumberFormat('en-IN', { style:'currency',currency:'INR',maximumFractionDigits:value%100?2:0 }).format((value||0)/100);
export const imageUrl = value => value?.startsWith('/media/') || value?.startsWith('/uploads/') ? `${API_URL}${value}` : value ? `${API_URL}/uploads/${encodeURIComponent(value)}` : '/placeholder.svg';
export function stored() { try { return JSON.parse(sessionStorage.getItem('gg-admin-v2')) || null; } catch { return null; } }
export async function api(path, {token,method='GET',body} = {}) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try {
    const form=body instanceof FormData;
    const response=await fetch(`${API_URL}${path}`,{method,signal:controller.signal,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body&&!form?{'Content-Type':'application/json'}:{})},body:body?(form?body:JSON.stringify(body)):undefined});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){if(response.status===401 && token) window.dispatchEvent(new Event('gg-admin-expired'));throw new Error(data.message||'Request could not be completed.');}return data;
  }catch(error){if(error.name==='AbortError')throw new Error('Request timed out. Refresh before submitting again.');if(error instanceof TypeError)throw new Error('Cannot reach the API. Check that the backend is running.');throw error;}finally{clearTimeout(timer);}
}
