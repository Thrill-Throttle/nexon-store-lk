const SUPABASE_CONFIG = window.NEXON_SUPABASE_CONFIG || {};
const defaultCategories = ["Electronics", "Home & Living", "Fashion", "Accessories", "Outdoor & Sports"];
let categories = [...defaultCategories];
let products = [
  {id:"nx-e01",name:"20W USB-C Fast Charger",category:"Electronics",price:7490,badge:"EVERYDAY PICK",stock:18,featured:true,image:"assets/fast-charger.svg",description:"A compact fast charger for your everyday devices. Easy to pack and convenient at home or on the go."},
  {id:"nx-h02",name:"Home Desk Lamp",category:"Home & Living",price:8990,badge:"HOME FAVOURITE",stock:11,featured:true,image:"assets/home-desk-lamp.svg",description:"A clean, modern desk lamp to brighten your reading corner, workspace or bedside table."},
  {id:"nx-f03",name:"Everyday Canvas Tote",category:"Fashion",price:5490,badge:"JUST IN",stock:14,featured:true,image:"assets/everyday-tote.svg",description:"A versatile canvas carryall for errands, books and everything else you bring along every day."},
  {id:"nx-a04",name:"Insulated Steel Water Bottle",category:"Accessories",price:6290,badge:"CUSTOMER PICK",stock:20,featured:true,image:"assets/steel-water-bottle.svg",description:"A reusable stainless steel bottle for your desk, daily commute and weekend adventures."},
  {id:"nx-h05",name:"Woven Home Storage Basket",category:"Home & Living",price:7890,badge:"HOME FAVOURITE",stock:9,featured:false,image:"assets/home-storage-basket.svg",description:"Keep everyday essentials together with a simple storage basket for your living space."},
  {id:"nx-o06",name:"Everyday Canvas Tote",category:"Outdoor & Sports",price:5490,badge:"ON THE GO",stock:12,featured:false,image:"assets/everyday-tote.svg",description:"A handy everyday bag for day trips, markets and everything you like to bring along."},
  {id:"nx-e07",name:"Compact USB-C Wall Charger",category:"Electronics",price:5290,badge:"COMPACT",stock:16,featured:false,image:"assets/fast-charger.svg",description:"A compact charging essential that fits easily into a work bag or travel pouch."},
  {id:"nx-a08",name:"Minimal Home Storage Basket",category:"Accessories",price:6990,badge:"USEFUL FIND",stock:8,featured:false,image:"assets/home-storage-basket.svg",description:"A versatile little basket for keeping bathroom, bedroom or desk essentials in order."}
];
const state = {
  cart:loadCart(),
  category:"All",
  search:"",
  currentView:"home",
  activeProduct:null,
  editingProduct:null,
  order:null,
  supabase:null,
  session:null,
  adminAuthorized:false,
  authReady:false,
  storeLoaded:false,
  catalogUnavailable:false,
  catalogIsDemo:true,
  pendingAdminRoute:false,
  adminMessage:"Preparing Google sign-in…"
};
const lkr = new Intl.NumberFormat("en-LK",{style:"currency",currency:"LKR",maximumFractionDigits:0});
const views = ["home","products","admin-login","admin","about","cart","checkout","payment"];
let toastTimer;

function readSavedValue(key,fallback) {
  try {
    const value=localStorage.getItem(key);
    return value===null?fallback:JSON.parse(value);
  } catch(error) {
    console.error(`Could not read saved ${key}:`,error);
    return fallback;
  }
}
function loadCart() {
  const saved=readSavedValue("nexon-cart",{});
  return saved&&typeof saved==="object"&&!Array.isArray(saved)?saved:{};
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
}
function saveCart() {
  try {
    localStorage.setItem("nexon-cart",JSON.stringify(state.cart));
  } catch(error) {
    console.error("Could not save the cart:",error);
    showToast("Cart could not be saved in this browser.");
  }
}
function getProduct(id) { return products.find(product=>product.id===id); }
function getCartEntries() {
  return Object.entries(state.cart).map(([id,qty])=>({product:getProduct(id),qty}))
    .filter(item=>item.product&&Number.isInteger(item.qty)&&item.qty>0);
}
function cartCount() { return getCartEntries().reduce((sum,item)=>sum+item.qty,0); }
function cartSubtotal() { return getCartEntries().reduce((sum,item)=>sum+item.product.price*item.qty,0); }
function setAdminLinksVisible(visible) {
  document.querySelectorAll(".admin-only").forEach(link=>{link.hidden=!visible;});
}
function updateAccountButton(session) {
  const button=document.querySelector(".account-button");
  const label=document.getElementById("account-label");
  const email=session?.user?.email;
  const signedIn=Boolean(session?.user);
  button.classList.toggle("is-signed-in",signedIn);
  label.textContent=signedIn?"My profile":"Sign in";
  button.setAttribute("aria-label",signedIn?`Signed in as ${email||"your account"}. Open your profile.`:"Sign in");
  button.title=signedIn?email||"Open your profile":"Sign in";
  button.querySelector(".user-icon").textContent=signedIn?(email?.trim().charAt(0).toUpperCase()||"♙"):"♙";
}
function setView(requestedView) {
  let view=requestedView;
  if(view==="admin"&&!state.adminAuthorized) view="admin-login";
  if(!views.includes(view)) return;
  closeModals();
  state.currentView=view;
  views.forEach(name=>{document.getElementById(`${name}-view`).hidden=name!==view;});
  document.querySelectorAll(".nav-link").forEach(link=>link.classList.toggle("active",link.dataset.view===view));
  document.querySelector(".main-nav").classList.remove("open");
  document.querySelector(".menu-toggle").setAttribute("aria-expanded","false");
  if(view==="products") renderCatalog();
  if(view==="admin"&&state.adminAuthorized) renderAdmin();
  if(view==="cart") renderCart();
  if(view==="checkout") renderCheckout();
  if(view==="payment") renderPayment();
  if(view==="admin-login") renderAdminLogin();
  const hash=view==="admin-login"?"admin/login":view;
  history.replaceState(null,"",`#${hash}`);
  window.scrollTo({top:0,behavior:"smooth"});
}

function productCard(product) {
  const id=escapeHTML(product.id),image=escapeHTML(product.image),name=escapeHTML(product.name),category=escapeHTML(product.category);
  const badge=product.badge?`<span class="product-badge">${escapeHTML(product.badge)}</span>`:"";
  return `<article class="product-card"><a class="product-card-link" href="#product-${id}" data-action="product" data-id="${id}" aria-label="View ${name}"></a><div class="product-image-wrap"><img class="product-image" src="${image}" alt="${name}" loading="lazy">${badge}</div><div class="product-info"><div class="product-category">${category}</div><h3 class="product-name">${name}</h3><p class="product-description">${escapeHTML(product.description)}</p><div class="product-price-row"><span class="product-price">${lkr.format(product.price)}</span><button class="product-add" type="button" data-action="add" data-id="${id}" aria-label="Add ${name} to cart">+</button></div></div></article>`;
}
function renderFeatured() {
  const featured=products.filter(product=>product.featured).slice(0,4);
  document.getElementById("featured-products").innerHTML=featured.map(productCard).join("");
  document.getElementById("featured-products").hidden=featured.length===0;
  const status=document.getElementById("featured-status");
  status.hidden=!state.catalogUnavailable&&!state.catalogIsDemo;
  if(state.catalogUnavailable) status.textContent="Our products are temporarily unavailable. Please check back soon.";
  else if(state.catalogIsDemo) status.textContent="Store preview: product listings, stock and prices are samples until the live store catalog is connected.";
}
function renderHomeCategories() {
  document.getElementById("home-categories").innerHTML=categories.map((category,index)=>
    `<button class="category-card" type="button" data-action="browse-category" data-category="${escapeHTML(category)}"><span class="category-number">${String(index+1).padStart(2,"0")} / COLLECTION</span><span class="category-art" aria-hidden="true">✦</span><strong>${escapeHTML(category)}</strong><span class="category-link">Browse collection ↗</span></button>`
  ).join("");
}
function renderFilters() {
  document.getElementById("catalog-filters").innerHTML=["All",...categories].map(category=>
    `<button class="filter-button ${state.category===category?"active":""}" type="button" data-action="filter" data-category="${escapeHTML(category)}">${escapeHTML(category)}</button>`
  ).join("");
}
function renderCatalog() {
  renderFilters();
  const matched=products.filter(product=>
    (state.category==="All"||product.category.toLowerCase()===state.category.toLowerCase())&&
    `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(state.search.toLowerCase())
  );
  document.getElementById("all-products").innerHTML=matched.map(productCard).join("");
  document.getElementById("catalog-count").textContent=`${matched.length} ${matched.length===1?"product":"products"}`;
  document.getElementById("no-products").hidden=matched.length>0;
  document.querySelector("#no-products h2").textContent=state.catalogUnavailable?"Our shop is temporarily unavailable":"No products found";
  document.querySelector("#no-products p").textContent=state.catalogUnavailable?"Please check back soon while we reconnect our product catalog.":"Try another search or category.";
  document.querySelector("#no-products [data-action=\"clear-filters\"]").hidden=state.catalogUnavailable;
  const status=document.getElementById("catalog-status");
  status.hidden=!state.catalogUnavailable&&!state.catalogIsDemo;
  if(state.catalogUnavailable) status.textContent="The live product catalog is temporarily unavailable. Please check back soon.";
  else if(state.catalogIsDemo) status.textContent="Store preview: product listings, stock and prices are samples. Connect the Supabase catalog to publish real store listings.";
  document.getElementById("all-products").hidden=matched.length===0;
}
function updateCartBadge() { document.querySelector(".cart-count").textContent=cartCount(); }
function addToCart(id) {
  const product=getProduct(id);
  if(!product) return;
  const current=state.cart[id]||0;
  if(product.stock===0) {showToast("This item is currently out of stock.");return;}
  if(current>=product.stock) {showToast("That’s all the available stock.");return;}
  state.cart[id]=current+1;
  saveCart();
  updateCartBadge();
  showToast(`${product.name} added to your cart.`);
}
function changeQuantity(id,delta) {
  const product=getProduct(id);
  if(!product) return;
  const next=(state.cart[id]||0)+delta;
  if(next<=0) delete state.cart[id];
  else state.cart[id]=Math.min(next,product.stock);
  saveCart();
  updateCartBadge();
  renderCart();
}
function removeFromCart(id) {
  delete state.cart[id];
  saveCart();
  updateCartBadge();
  renderCart();
}
function renderSummary(targetId) {
  const target=document.getElementById(targetId);
  if(!target) return;
  const count=cartCount(),subtotal=cartSubtotal();
  target.innerHTML=`<h2>Order summary</h2><div class="summary-line"><span>Items (${count})</span><strong>${lkr.format(subtotal)}</strong></div><div class="summary-line"><span>Delivery</span><strong>Calculated when the store is live</strong></div><div class="summary-line total"><span>Subtotal</span><strong>${lkr.format(subtotal)}</strong></div><p class="summary-note">Delivery rates will be confirmed by the store. This preview does not submit or save orders.</p>${state.currentView==="cart"?`<button class="button button-primary full-width" type="button" data-action="checkout" ${count===0?"disabled":""}>Continue to checkout <span>→</span></button><button class="text-button continue-shopping full-width" type="button" data-view="products">Continue shopping</button>`:""}`;
}
function renderCart() {
  const target=document.getElementById("cart-items"),entries=getCartEntries();
  if(!entries.length) {
    target.innerHTML=`<div class="empty-cart"><div class="empty-cart-icon">▱</div><h2>Your cart is taking a break.</h2><p>Have a look through our latest finds.</p><button class="button button-primary" type="button" data-view="products">Browse the shop <span>→</span></button></div>`;
    document.getElementById("cart-summary").innerHTML="";
    return;
  }
  target.innerHTML=entries.map(({product,qty})=>
    `<div class="cart-row"><img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}"><div class="cart-row-details"><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.category)} · ${lkr.format(product.price)} each</small><div class="cart-controls"><div class="quantity-control"><button type="button" data-action="quantity" data-id="${escapeHTML(product.id)}" data-delta="-1" aria-label="Decrease quantity">−</button><span>${qty}</span><button type="button" data-action="quantity" data-id="${escapeHTML(product.id)}" data-delta="1" aria-label="Increase quantity">+</button></div><button class="remove-item" type="button" data-action="remove" data-id="${escapeHTML(product.id)}">Remove</button></div></div><div class="cart-row-price">${lkr.format(product.price*qty)}</div></div>`
  ).join("");
  renderSummary("cart-summary");
}
function renderCheckout() {renderSummary("checkout-summary");}
function renderPayment() {
  if(!state.order) return;
  document.getElementById("payment-reference").textContent=state.order.reference;
  document.getElementById("payment-total").textContent=lkr.format(state.order.total);
  const text=`Hi NEXON STORE, this is a payment receipt for my demo preview only. Reference: ${state.order.reference}. Customer: ${state.order.name}. Preview total: ${lkr.format(state.order.total)}. Please note: this is not a real order.`;
  document.querySelector(".whatsapp-receipt").href=`https://wa.me/94722924522?text=${encodeURIComponent(text)}`;
}
function openProduct(id) {
  const product=getProduct(id);
  if(!product) return;
  state.activeProduct=id;
  document.getElementById("product-modal-content").innerHTML=`<div class="product-modal-content"><img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}"><div><div class="eyebrow">${escapeHTML(product.category)}</div><h2>${escapeHTML(product.name)}</h2><p>${escapeHTML(product.description)}</p><div class="modal-price">${lkr.format(product.price)}</div><p>${product.stock>0?`${product.stock} in stock`:"Currently out of stock"}</p><button class="button button-primary full-width" type="button" data-action="modal-add" data-id="${escapeHTML(product.id)}" ${product.stock===0?"disabled":""}>Add to cart <span>+</span></button></div></div>`;
  document.getElementById("product-modal").hidden=false;
}

function setAdminMessage(message,isError=false) {
  state.adminMessage=message;
  const element=document.getElementById("admin-auth-message");
  if(element) {
    element.textContent=message;
    element.classList.toggle("is-error",isError);
  }
}
function showAdminFeedback(message,isError=false) {
  const element=document.getElementById("admin-feedback");
  element.textContent=message;
  element.classList.toggle("is-error",isError);
  element.hidden=false;
}
function renderAdminLogin() {
  const button=document.getElementById("admin-google-login");
  button.disabled=!state.supabase||!state.authReady;
  setAdminMessage(state.adminMessage,state.adminMessage.startsWith("Access denied")||state.adminMessage.startsWith("Secure admin"));
}
function renderAdmin() {
  if(!state.adminAuthorized||!state.session) {setView("admin-login");return;}
  document.getElementById("admin-account-email").textContent=state.session.user.email||"";
  document.getElementById("admin-layout").hidden=!state.storeLoaded;
  if(!state.storeLoaded) return;
  document.getElementById("admin-category-count").textContent=categories.length;
  document.getElementById("admin-category-list").innerHTML=categories.map((category,index)=>
    `<form class="admin-category-row" data-category-edit="${escapeHTML(category)}"><span class="admin-category-number">${String(index+1).padStart(2,"0")}</span><input aria-label="Category name" name="category" maxlength="32" value="${escapeHTML(category)}" required><button type="submit" class="text-button" aria-label="Save category ${escapeHTML(category)}">Save</button>${categories.length>1?`<button type="button" class="remove-item" data-action="delete-category" data-category="${escapeHTML(category)}">Delete</button>`:""}</form>`
  ).join("");
  const categorySelect=document.getElementById("product-category");
  const selectedCategory=categories.find(category=>category.toLowerCase()===categorySelect.value.toLowerCase())||categories[0];
  categorySelect.innerHTML=categories.map(category=>
    `<option value="${escapeHTML(category)}"${category===selectedCategory?" selected":""}>${escapeHTML(category)}</option>`
  ).join("");
  document.getElementById("admin-product-count").textContent=products.length;
  document.getElementById("admin-product-list").innerHTML=products.map(product=>
    `<div class="admin-product-row"><img src="${escapeHTML(product.image)}" alt=""><div class="admin-product-copy"><strong>${escapeHTML(product.name)}</strong><span>${escapeHTML(product.category)} · ${lkr.format(product.price)} · ${product.stock} in stock</span></div><button class="text-button" type="button" data-action="edit-product" data-id="${escapeHTML(product.id)}">Edit</button><button class="remove-item" type="button" data-action="delete-product" data-id="${escapeHTML(product.id)}">Delete</button></div>`
  ).join("")||`<p class="admin-empty">No products yet. Add your first item above.</p>`;
}

async function loadStoreData() {
  const {data:categoryRows,error:categoryError}=await state.supabase.from("store_categories").select("id,name").order("name");
  if(categoryError) throw categoryError;
  const {data:productRows,error:productError}=await state.supabase.from("store_products").select("id,name,category_id,price_lkr,stock_quantity,badge,featured,image_url,description,category:store_categories!inner(name)").order("created_at",{ascending:false});
  if(productError) throw productError;
  categories=categoryRows.map(row=>row.name);
  products=productRows.map(row=>({
    id:row.id,
    name:row.name,
    category:row.category.name,
    price:Number(row.price_lkr),
    stock:row.stock_quantity,
    badge:row.badge||"",
    featured:row.featured,
    image:row.image_url,
    description:row.description
  }));
  state.storeLoaded=true;
  state.catalogUnavailable=false;
  state.catalogIsDemo=false;
  renderFeatured();
  renderHomeCategories();
  renderCatalog();
  if(state.currentView==="admin") renderAdmin();
}

function isGoogleAccount(user) {
  const providers=user?.app_metadata?.providers||[];
  return user?.app_metadata?.provider==="google"||providers.includes("google");
}
async function updateAuthState(session) {
  state.session=session;
  updateAccountButton(session);
  state.adminAuthorized=false;
  state.authReady=false;
  setAdminLinksVisible(false);
  document.getElementById("admin-layout").hidden=true;
  if(!session?.user) {
    state.authReady=true;
    state.adminMessage=state.supabase
      ?"Sign in with the approved Google account to continue. Only authorized Google accounts can access store management."
      :"Secure Google sign-in is not configured yet. Complete the setup steps in README.md.";
    if(state.pendingAdminRoute) {state.pendingAdminRoute=false;setView("admin-login");}
    else if(state.currentView==="admin") setView("admin-login");
    else if(state.currentView==="admin-login") renderAdminLogin();
    return;
  }
  if(!isGoogleAccount(session.user)) {
    state.authReady=true;
    state.adminMessage="Access denied. This Google account is not authorized to manage the store.";
    setAdminLinksVisible(false);
    if(state.pendingAdminRoute||state.currentView==="admin-login"||state.currentView==="admin") {
      state.pendingAdminRoute=false;
      if(state.currentView!=="admin-login") setView("admin-login");
      else renderAdminLogin();
    }
    return;
  }
  let roleResult;
  try {
    roleResult=await state.supabase.rpc("is_store_admin");
  } catch(error) {
    console.error("Secure store administrator role check could not reach the database:",error);
    state.authReady=true;
    state.adminMessage="Secure admin access could not be verified. Check the database connection and try again.";
    if(state.currentView==="admin") setView("admin-login");
    else renderAdminLogin();
    return;
  }
  const {data:hasAdminRole,error:roleError}=roleResult;
  if(errorRoleChanged(session)) return;
  if(roleError) {
    console.error("Secure store administrator role check failed:",roleError);
    state.authReady=true;
    state.adminMessage="Secure admin access could not be verified. Contact the store administrator.";
    if(state.currentView==="admin") setView("admin-login");
    else renderAdminLogin();
    return;
  }
  if(hasAdminRole!==true) {
    state.authReady=true;
    state.adminMessage="Access denied. This Google account does not have the verified administrator role.";
    if(state.currentView==="admin") setView("admin-login");
    else renderAdminLogin();
    return;
  }
  state.adminAuthorized=true;
  state.authReady=true;
  state.adminMessage=`Verified administrator: ${session.user.email}`;
  setAdminLinksVisible(true);
  try {
    state.storeLoaded=false;
    await loadStoreData();
  } catch(error) {
    console.error("Could not load store management data:",error);
    state.storeLoaded=false;
    showAdminFeedback("Store data could not be loaded. Check the Supabase database migration and connection, then retry.",true);
  }
  if(state.pendingAdminRoute) {
    state.pendingAdminRoute=false;
    setView("admin");
  } else if(state.currentView==="admin-login") {
    setView("admin");
  } else {
    renderAdminLogin();
  }
}
function errorRoleChanged(session) {
  return !state.session||state.session.access_token!==session.access_token;
}
async function initializeAuth() {
  const url=String(SUPABASE_CONFIG.url||"").trim();
  const anonKey=String(SUPABASE_CONFIG.anonKey||"").trim();
  const isProjectConfigured=[url,anonKey].some(value=>value&&!/YOUR_/i.test(value));
  const validProjectUrl=/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url);
  const validPublicKey=Boolean(anonKey)&&!/service[_-]?role|sb_secret/i.test(anonKey);
  if(!validProjectUrl||!validPublicKey||!window.supabase?.createClient) {
    state.authReady=true;
    if(isProjectConfigured) {
      console.error("Supabase is partially configured or its public client could not be initialized. Check the project URL, public key, and Supabase JavaScript CDN.");
      state.catalogUnavailable=true;
      state.catalogIsDemo=false;
      categories=[];
      products=[];
      renderFeatured();
      renderHomeCategories();
      renderCatalog();
      state.adminMessage="Supabase could not be connected securely. Check the project URL, public publishable/anon key, and internet connection.";
    } else {
      state.adminMessage="Secure Google sign-in is not configured. Follow the Supabase setup instructions in README.md.";
    }
    renderAdminLogin();
    if(state.pendingAdminRoute) {state.pendingAdminRoute=false;setView("admin-login");}
    return;
  }
  state.supabase=window.supabase.createClient(url,anonKey,{auth:{flowType:"pkce",autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
  state.supabase.auth.onAuthStateChange((_event,session)=>{
    setTimeout(()=>{void updateAuthState(session);},0);
  });
  const {data,error}=await state.supabase.auth.getSession();
  if(error) {
    console.error("Could not restore the Google sign-in session:",error);
    state.authReady=true;
    state.adminMessage="Secure sign-in could not be started. Reload the page and try again.";
    renderAdminLogin();
    return;
  }
  try {
    await loadStoreData();
  } catch(loadError) {
    console.error("Could not load the public store catalog:",loadError);
    state.catalogUnavailable=true;
    state.catalogIsDemo=false;
    state.storeLoaded=false;
    categories=[];
    products=[];
    renderFeatured();
    renderHomeCategories();
    renderCatalog();
    showToast("The store catalog is temporarily unavailable.");
  }
  await updateAuthState(data.session);
}
async function startAdminGoogleLogin() {
  if(!state.supabase) {setAdminMessage("Secure Google sign-in is not configured. Follow the Supabase setup instructions in README.md.",true);renderAdminLogin();return;}
  setAdminMessage("Redirecting to Google for secure sign-in…");
  const redirectTo=`${location.origin}${location.pathname}#admin`;
  let result;
  try {
    result=await state.supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo,scopes:"openid email profile",queryParams:{prompt:"select_account"}}});
  } catch(error) {
    console.error("Google administrator sign-in could not reach Supabase:",error);
    setAdminMessage("Google sign-in could not start. Check your network and the OAuth configuration.",true);
    renderAdminLogin();
    return;
  }
  const {error}=result;
  if(error) {
    console.error("Google administrator sign-in failed:",error);
    setAdminMessage("Google sign-in could not start. Check the Google and Supabase OAuth configuration.",true);
    renderAdminLogin();
  }
}
async function signOutAdmin() {
  if(!state.supabase) return;
  let result;
  try {
    result=await state.supabase.auth.signOut();
  } catch(error) {
    console.error("Administrator sign-out could not reach Supabase:",error);
    showAdminFeedback("Sign-out failed because the authentication server could not be reached. Please retry.",true);
    return;
  }
  const {error}=result;
  if(error) {
    console.error("Could not sign out of the administrator account:",error);
    showAdminFeedback("Sign-out failed. Please retry.",true);
    return;
  }
  state.session=null;
  state.adminAuthorized=false;
  updateAccountButton(null);
  setAdminLinksVisible(false);
  setView("home");
}
async function withAdminAccess(action) {
  if(!state.supabase||!state.adminAuthorized||!state.session) {
    showAdminFeedback("Administrator authorization is required. Sign in with the approved Google account.",true);
    setView("admin-login");
    return false;
  }
  let result;
  try {
    result=await action();
  } catch(error) {
    console.error("Secure store management request could not reach the database:",error);
    showAdminFeedback("The database could not be reached. Check your connection and try again.",true);
    return false;
  }
  if(result?.error) {
    console.error("Secure store management operation failed:",result.error);
    showAdminFeedback("The database rejected this change. Check your admin access and database setup, then try again.",true);
    return false;
  }
  return true;
}

async function addCategory(rawName) {
  const name=rawName.trim().slice(0,32);
  if(!name) {showAdminFeedback("Enter a category name.",true);return false;}
  if(categories.some(category=>category.toLowerCase()===name.toLowerCase())) {showAdminFeedback("That category already exists.",true);return false;}
  if(!await withAdminAccess(()=>state.supabase.from("store_categories").insert({name}))) return false;
  try {await loadStoreData();renderAdmin();showToast(`${name} added to your shop.`);return true;}
  catch(error) {console.error("Could not refresh categories after saving:",error);showAdminFeedback("The category was saved, but the shop list could not be refreshed. Reload and try again.",true);return false;}
}
async function renameCategory(previousName,rawName) {
  const name=rawName.trim().slice(0,32);
  if(!name) {showAdminFeedback("Category names cannot be empty.",true);renderAdmin();return;}
  if(categories.some(category=>category!==previousName&&category.toLowerCase()===name.toLowerCase())) {showAdminFeedback("A category with that name already exists.",true);renderAdmin();return;}
  const category=categories.find(item=>item===previousName);
  if(!category) return;
  const {data:categoryRow,error:lookupError}=await state.supabase.from("store_categories").select("id").eq("name",previousName).single();
  if(lookupError) {console.error("Could not find the category to rename:",lookupError);showAdminFeedback("Could not find that category. Refresh the admin page and try again.",true);return;}
  if(!await withAdminAccess(()=>state.supabase.from("store_categories").update({name}).eq("id",categoryRow.id))) return;
  try {await loadStoreData();renderAdmin();showToast("Category updated.");}
  catch(error) {console.error("Could not refresh renamed category:",error);showAdminFeedback("The category was renamed but the shop list could not be refreshed.",true);}
}
async function deleteCategory(category) {
  if(categories.length<=1) {showAdminFeedback("Keep at least one category in your shop.",true);return;}
  const replacement=categories.find(item=>item!==category);
  if(!window.confirm(`Delete "${category}"? Products in this category will be moved to "${replacement}".`)) return;
  const {data:rows,error:lookupError}=await state.supabase.from("store_categories").select("id,name").in("name",[category,replacement]);
  if(lookupError) {console.error("Could not find categories to update:",lookupError);showAdminFeedback("Could not find the selected categories. Refresh and try again.",true);return;}
  const target=rows.find(row=>row.name===category),destination=rows.find(row=>row.name===replacement);
  if(!target||!destination) {showAdminFeedback("A category could not be found. Refresh and try again.",true);return;}
  const success=await withAdminAccess(()=>state.supabase.rpc("admin_delete_store_category",{target_category_id:target.id,replacement_category_id:destination.id}));
  if(!success) return;
  if(state.category===category) state.category="All";
  try {await loadStoreData();renderAdmin();showToast(`Category removed. Products moved to ${replacement}.`);}
  catch(error) {console.error("Could not refresh products after deleting category:",error);showAdminFeedback("The category was removed but the shop list could not be refreshed.",true);}
}
function editProduct(id) {
  const product=getProduct(id);
  if(!product||!state.adminAuthorized) return;
  state.editingProduct=id;
  const form=document.getElementById("product-form");
  form.elements.name.value=product.name;
  document.getElementById("product-category").value=product.category;
  form.elements.price.value=product.price;
  form.elements.stock.value=product.stock;
  form.elements.badge.value=product.badge;
  form.elements.image.value=product.image.startsWith("https://")?product.image:"";
  form.elements.description.value=product.description;
  form.elements.featured.checked=product.featured;
  document.getElementById("admin-product-heading").textContent="Edit product";
  document.getElementById("product-submit").innerHTML="Save changes <span>✓</span>";
  document.getElementById("cancel-product-edit").hidden=false;
  form.scrollIntoView({behavior:"smooth",block:"center"});
}
function resetProductForm() {
  state.editingProduct=null;
  const form=document.getElementById("product-form");
  form.reset();
  form.elements.stock.value="10";
  document.getElementById("admin-product-heading").textContent="Add a product";
  document.getElementById("product-submit").innerHTML="Add product <span>+</span>";
  document.getElementById("cancel-product-edit").hidden=true;
}
async function saveProduct(form) {
  if(!state.adminAuthorized||!state.storeLoaded) {showAdminFeedback("Wait until secure store data has loaded.",true);return;}
  const data=new FormData(form);
  const name=String(data.get("name")||"").trim();
  const category=categories.find(item=>item===String(data.get("category")));
  const price=Number(data.get("price")),stock=Number(data.get("stock"));
  const description=String(data.get("description")||"").trim();
  const imageInput=String(data.get("image")||"").trim();
  if(!name||name.length>70||!category||!Number.isSafeInteger(price)||price<1||!Number.isSafeInteger(stock)||stock<0||!description) {showAdminFeedback("Check the product name, category, price, stock and description.",true);return;}
  if(imageInput&&!/^https:\/\/[^\s"'<>]+$/i.test(imageInput)) {showAdminFeedback("Product image links must begin with https://.",true);return;}
  const existing=getProduct(state.editingProduct);
  const payload={
    name,category_id:await getCategoryId(category),price_lkr:price,stock_quantity:stock,
    badge:String(data.get("badge")||"").trim().slice(0,24),
    featured:data.get("featured")==="on",
    image_url:imageInput||(existing?existing.image:"assets/home-storage-basket.svg"),
    description:description.slice(0,240)
  };
  if(!payload.category_id) {showAdminFeedback("Could not find that product category. Refresh and try again.",true);return;}
  const query=existing
    ?state.supabase.from("store_products").update(payload).eq("id",existing.id)
    :state.supabase.from("store_products").insert(payload);
  if(!await withAdminAccess(()=>query)) return;
  const productId=existing?.id;
  if(productId&&stock===0) delete state.cart[productId];
  else if(productId&&state.cart[productId]) state.cart[productId]=Math.min(state.cart[productId],stock);
  saveCart();
  resetProductForm();
  try {await loadStoreData();renderAdmin();renderCart();updateCartBadge();showToast(existing?"Product updated.":"Product added to the shop.");}
  catch(error) {console.error("Could not refresh the product catalog:",error);showAdminFeedback("The product was saved but the catalog could not be refreshed.",true);}
}
async function getCategoryId(name) {
  const {data,error}=await state.supabase.from("store_categories").select("id").eq("name",name).single();
  if(error) {console.error("Could not find selected category:",error);return null;}
  return data.id;
}
async function deleteProduct(id) {
  const product=getProduct(id);
  if(!product||!window.confirm(`Delete "${product.name}" from your product list?`)) return;
  if(!await withAdminAccess(()=>state.supabase.from("store_products").delete().eq("id",id))) return;
  delete state.cart[id];
  saveCart();
  if(state.editingProduct===id) resetProductForm();
  try {await loadStoreData();renderAdmin();renderCart();updateCartBadge();showToast("Product removed from your shop.");}
  catch(error) {console.error("Could not refresh the product catalog:",error);showAdminFeedback("The product was removed but the catalog could not be refreshed.",true);}
}

function closeModals() {document.querySelectorAll(".modal-backdrop").forEach(modal=>{modal.hidden=true;});}
function showToast(message) {
  const toast=document.getElementById("toast");
  toast.textContent=message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove("visible"),2600);
}
function searchProducts() {
  state.search=document.querySelector(".search-bar input").value.trim();
  state.category="All";
  setView("products");
}
document.addEventListener("click",event=>{
  const target=event.target.closest("[data-view],[data-action]");
  if(!target) return;
  if(target.dataset.view) {event.preventDefault();setView(target.dataset.view);return;}
  switch(target.dataset.action) {
    case "add": addToCart(target.dataset.id);break;
    case "product": event.preventDefault();openProduct(target.dataset.id);break;
    case "modal-add": addToCart(target.dataset.id);closeModals();break;
    case "browse-category":
    case "filter":
      event.preventDefault();
      state.category=target.dataset.category;
      state.search="";
      if(target.dataset.action==="browse-category") setView("products");
      else renderCatalog();
      break;
    case "quantity": changeQuantity(target.dataset.id,Number(target.dataset.delta));break;
    case "remove": removeFromCart(target.dataset.id);break;
    case "checkout": if(cartCount()) setView("checkout");break;
    case "login":
      if(state.session?.user) setView(state.adminAuthorized?"admin":"admin-login");
      else document.getElementById("login-modal").hidden=false;
      break;
    case "close-modal": closeModals();break;
    case "search": searchProducts();break;
    case "clear-filters": state.search="";state.category="All";renderCatalog();break;
    case "delete-category": void deleteCategory(target.dataset.category);break;
    case "edit-product": editProduct(target.dataset.id);break;
    case "delete-product": void deleteProduct(target.dataset.id);break;
    case "cancel-product-edit": resetProductForm();break;
    case "admin-google-login": void startAdminGoogleLogin();break;
    case "admin-signout": void signOutAdmin();break;
  }
});
document.getElementById("category-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  if(await addCategory(String(new FormData(form).get("category")||""))) form.reset();
});
document.getElementById("admin-category-list").addEventListener("submit",event=>{
  if(!event.target.matches("[data-category-edit]")) return;
  event.preventDefault();
  void renameCategory(event.target.dataset.categoryEdit,String(new FormData(event.target).get("category")||""));
});
document.getElementById("product-form").addEventListener("submit",event=>{
  event.preventDefault();
  void saveProduct(event.currentTarget);
});
document.querySelector(".search-toggle").addEventListener("click",()=>{
  const bar=document.querySelector(".search-bar");
  bar.hidden=!bar.hidden;
  if(!bar.hidden) bar.querySelector("input").focus();
});
document.querySelector(".search-bar input").addEventListener("keydown",event=>{if(event.key==="Enter")searchProducts();});
document.querySelector(".menu-toggle").addEventListener("click",event=>{
  const nav=document.querySelector(".main-nav"),open=nav.classList.toggle("open");
  event.currentTarget.setAttribute("aria-expanded",String(open));
});
document.addEventListener("keydown",event=>{if(event.key==="Escape")closeModals();});
document.querySelectorAll(".modal-backdrop").forEach(backdrop=>backdrop.addEventListener("click",event=>{
  if(event.target===backdrop)closeModals();
}));
document.getElementById("checkout-form").addEventListener("submit",event=>{
  event.preventDefault();
  if(!cartCount()) {showToast("Your cart is empty.");setView("cart");return;}
  const form=new FormData(event.currentTarget);
  state.order={reference:`DEMO-${Date.now().toString().slice(-7)}`,name:String(form.get("name")||"Customer"),total:cartSubtotal()};
  setView("payment");
});

document.getElementById("year").textContent=new Date().getFullYear();
renderFeatured();
renderHomeCategories();
renderCatalog();
updateCartBadge();
setAdminLinksVisible(false);
const initialHash=location.hash.slice(1);
if(initialHash==="admin"||initialHash==="admin/login") state.pendingAdminRoute=true;
else if(views.includes(initialHash)&&initialHash!=="payment"&&initialHash!=="checkout") setView(initialHash);
window.addEventListener("hashchange",()=>{
  const hash=location.hash.slice(1);
  if(hash==="admin"||hash==="admin/login") {
    state.pendingAdminRoute=true;
    if(state.authReady) {
      if(state.supabase) void updateAuthState(state.session);
      else {state.pendingAdminRoute=false;setView("admin-login");}
    }
  } else if(views.includes(hash)&&hash!=="payment"&&hash!=="checkout") {
    setView(hash);
  }
});
void initializeAuth();
