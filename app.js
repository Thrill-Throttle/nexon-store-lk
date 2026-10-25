const SUPABASE_CONFIG = window.NEXON_SUPABASE_CONFIG || {};
const STORE_LOGO_BUCKET = "nexon-store-branding";
const DEFAULT_STORE_LOGO = "assets/nexon-logo.png";
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
  adminSection:"products",
  activeProduct:null,
  editingProduct:null,
  order:null,
  supabase:null,
  session:null,
  adminAuthorized:false,
  authReady:false,
  storeLoaded:false,
  loadedCategories:[],
  loadedProducts:[],
  catalogUnavailable:false,
  catalogIsDemo:true,
  catalogDraft:null,
  catalogDraftError:false,
  storeSettings:{delivery_fee_lkr:0},
  logoPreviewUrl:null,
  customerOrders:[],
  adminOrders:[],
  knownAdminOrderIds:null,
  adminOrderPollTimer:null,
  currentOrder:null,
  isLoadingOrders:false,
  pendingAdminRoute:false,
  pendingAuthView:null,
  adminMessage:"Preparing Google sign-in…"
};
const lkr = new Intl.NumberFormat("en-LK",{style:"currency",currency:"LKR",maximumFractionDigits:0});
const views = ["home","products","profile","admin-login","admin","about","cart","checkout","payment"];
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
function getPublicStoreLogoUrl(path,updatedAt) {
  if(!path||!state.supabase) return DEFAULT_STORE_LOGO;
  const {data}=state.supabase.storage.from(STORE_LOGO_BUCKET).getPublicUrl(path);
  const url=new URL(data.publicUrl);
  if(updatedAt) url.searchParams.set("v",String(updatedAt));
  return url.href;
}
function applyStoreLogo(path,updatedAt) {
  const url=getPublicStoreLogoUrl(path,updatedAt);
  document.querySelectorAll(".store-logo").forEach(image=>{image.src=url;});
  const preview=document.getElementById("admin-logo-preview");
  if(preview&&!state.logoPreviewUrl) preview.src=url;
}
function previewStoreLogo(file) {
  const status=document.getElementById("logo-status");
  const preview=document.getElementById("admin-logo-preview");
  if(!file) {
    if(state.logoPreviewUrl) URL.revokeObjectURL(state.logoPreviewUrl);
    state.logoPreviewUrl=null;
    applyStoreLogo(state.storeSettings.logo_path,state.storeSettings.logo_updated_at);
    status.textContent="Choose a PNG, JPEG, or WebP image up to 5 MB.";
    return;
  }
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>5*1024*1024) {
    document.getElementById("store-logo-file").value="";
    if(state.logoPreviewUrl) URL.revokeObjectURL(state.logoPreviewUrl);
    state.logoPreviewUrl=null;
    applyStoreLogo(state.storeSettings.logo_path,state.storeSettings.logo_updated_at);
    status.textContent="Choose a PNG, JPEG, or WebP image no larger than 5 MB.";
    showAdminFeedback(status.textContent,true);
    return;
  }
  if(state.logoPreviewUrl) URL.revokeObjectURL(state.logoPreviewUrl);
  state.logoPreviewUrl=URL.createObjectURL(file);
  preview.src=state.logoPreviewUrl;
  status.textContent=`Previewing ${file.name}. Publish the logo when you're ready.`;
}
async function publishStoreLogo(form) {
  if(!state.adminAuthorized||!state.supabase) return;
  const file=new FormData(form).get("logo");
  if(!(file instanceof File)||!file.size) {
    showAdminFeedback("Choose a logo image before publishing.",true);
    return;
  }
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>5*1024*1024) {
    showAdminFeedback("Choose a PNG, JPEG, or WebP image no larger than 5 MB.",true);
    return;
  }
  if(!window.confirm("Publish this logo across the live storefront now?")) return;
  const button=document.getElementById("publish-logo-button");
  button.disabled=true;
  const status=document.getElementById("logo-status");
  status.textContent="Uploading the new logo…";
  let logoUploaded=false;
  try {
    if(!window.crypto?.randomUUID) throw new Error("Secure logo IDs are not supported by this browser.");
    const logoPath=`store-logo/${window.crypto.randomUUID()}`;
    const {error:uploadError}=await state.supabase.storage.from(STORE_LOGO_BUCKET)
      .upload(logoPath,file,{cacheControl:"3600",contentType:file.type,upsert:false});
    if(uploadError) throw uploadError;
    logoUploaded=true;
    const {error:updateError}=await state.supabase.rpc("admin_update_store_logo",{p_logo_path:logoPath});
    if(updateError) throw updateError;
    if(state.logoPreviewUrl) URL.revokeObjectURL(state.logoPreviewUrl);
    state.logoPreviewUrl=null;
    form.reset();
    const settingsLoaded=await loadStoreSettings(true);
    if(!settingsLoaded) {
      status.textContent="Logo uploaded, but the page could not refresh its settings. Reload to verify the live logo.";
      showAdminFeedback(status.textContent,true);
      return;
    }
    status.textContent="Your new logo is now live across the storefront.";
    showAdminFeedback("Store logo published successfully.");
  } catch(error) {
    console.error("Could not publish the store logo:",error);
    status.textContent=logoUploaded
      ?"The logo file uploaded, but publishing failed. The existing storefront logo is unchanged; check the branding migration and retry."
      :"Logo upload failed. Check the branding migration and connection, then retry.";
    showAdminFeedback(status.textContent,true);
  } finally {
    button.disabled=false;
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
  const user=session?.user;
  const email=user?.email;
  const signedIn=Boolean(user);
  const metadata=user?.user_metadata||{};
  const displayName=String(metadata.full_name||metadata.name||email?.split("@")[0]||"").trim();
  const initial=displayName.charAt(0).toUpperCase();
  button.classList.toggle("is-signed-in",signedIn);
  label.textContent=signedIn?"My profile":"Sign in";
  button.setAttribute("aria-label",signedIn?`Signed in as ${email||"your account"}. Open your profile.`:"Sign in");
  button.title=signedIn?email||"Open your profile":"Sign in";
  const outlineIcon=button.querySelector(".user-outline");
  const initialBadge=button.querySelector(".user-initial");
  outlineIcon.hidden=signedIn;
  initialBadge.hidden=!signedIn;
  initialBadge.textContent=signedIn?(initial||"♙"):"";
  const avatar=button.querySelector(".account-avatar");
  avatar.hidden=true;
  avatar.removeAttribute("src");
}
function setView(requestedView) {
  let view=requestedView;
  if(view==="profile"&&!state.session?.user) {
    state.pendingAuthView="profile";
    view="admin-login";
  }
  if(view==="checkout"&&!state.session?.user) {
    state.pendingAuthView="checkout";
    state.adminMessage="Sign in with Google to save your checkout and track your orders.";
    view="admin-login";
  }
  if(view==="admin"&&!state.adminAuthorized) {
    if(state.session?.user) view="profile";
    else {
      state.pendingAuthView="admin";
      view="admin-login";
    }
  }
  if(!views.includes(view)) return;
  closeModals();
  state.currentView=view;
  views.forEach(name=>{document.getElementById(`${name}-view`).hidden=name!==view;});
  document.querySelectorAll(".nav-link").forEach(link=>link.classList.toggle("active",link.dataset.view===view));
  document.querySelector(".main-nav").classList.remove("open");
  document.querySelector(".menu-toggle").setAttribute("aria-expanded","false");
  if(view==="products") renderCatalog();
  if(view==="profile"&&state.session?.user) renderProfile();
  if(view==="admin"&&state.adminAuthorized) renderAdmin();
  if(view==="profile"&&state.session?.user) void loadCustomerOrders();
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
function updateCartBadge() {
  const count=cartCount();
  document.querySelector(".cart-count").textContent=count;
  document.querySelector(".cart-button").setAttribute("aria-label",`Shopping cart, ${count} ${count===1?"item":"items"}`);
  const profileCount=document.getElementById("profile-cart-count");
  const profileSummary=document.getElementById("profile-cart-summary");
  if(profileCount) profileCount.textContent=count;
  if(profileSummary) profileSummary.textContent=count
    ?`${count} ${count===1?"item":"items"} in your cart · ${lkr.format(cartSubtotal())}`
    :"Your cart is empty. Browse the shop and find something you love.";
}
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
  const count=cartCount(),subtotal=cartSubtotal(),fee=Number(state.storeSettings.delivery_fee_lkr)||0;
  target.innerHTML=`<h2>Order summary</h2><div class="summary-line"><span>Items (${count})</span><strong>${lkr.format(subtotal)}</strong></div><div class="summary-line"><span>Delivery</span><strong>${fee===0?"Free":lkr.format(fee)}</strong></div><div class="summary-line total"><span>Total</span><strong>${lkr.format(subtotal+fee)}</strong></div><p class="summary-note">Payment is reviewed manually after you send your receipt on WhatsApp.</p>${state.currentView==="cart"?`<button class="button button-primary full-width" type="button" data-action="checkout" ${count===0?"disabled":""}>Continue to checkout <span>→</span></button><button class="text-button continue-shopping full-width" type="button" data-view="products">Continue shopping</button>`:""}`;
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
function renderCheckout() {
  renderSummary("checkout-summary");
  const metadata=state.session?.user?.user_metadata||{};
  const nameInput=document.querySelector("#checkout-form [name=\"name\"]");
  const emailInput=document.querySelector("#checkout-form [name=\"email\"]");
  if(nameInput&&!nameInput.value) nameInput.value=metadata.full_name||metadata.name||"";
  if(emailInput) {
    emailInput.value=state.session?.user?.email||"";
    emailInput.readOnly=true;
  }
}
function renderPayment() {
  if(!state.currentOrder) return;
  const order=state.currentOrder;
  document.getElementById("payment-order-reference").textContent=order.reference;
  document.getElementById("payment-reference").textContent=order.reference;
  document.getElementById("payment-total").textContent=lkr.format(order.total_lkr);
  document.getElementById("payment-status-message").textContent=paymentStatusLabel(order.payment_status);
  const markPaidButton=document.getElementById("customer-mark-paid");
  markPaidButton.hidden=order.payment_status==="awaiting_approval"||order.payment_status==="approved";
  const receiptLink=document.getElementById("whatsapp-receipt");
  receiptLink.hidden=order.payment_status==="approved";
  const text=`Hi NEXON STORE, I have paid for order ${order.reference}. Amount: ${lkr.format(order.total_lkr)}. I will attach my payment receipt for verification.`;
  receiptLink.href=`https://wa.me/94722924522?text=${encodeURIComponent(text)}`;
}
async function placeStoreOrder(form) {
  if(!state.session?.user||!state.supabase) {
    state.pendingAuthView="checkout";
    setView("admin-login");
    return;
  }
  const entries=getCartEntries();
  if(!entries.length) {showToast("Your cart is empty.");setView("cart");return;}
  const data=new FormData(form);
  const {data:orderRows,error}=await state.supabase.rpc("create_store_order",{
    p_customer_name:String(data.get("name")||"").trim(),
    p_customer_phone:String(data.get("phone")||"").trim(),
    p_delivery_address:String(data.get("address")||"").trim(),
    p_delivery_city:String(data.get("city")||"").trim(),
    p_delivery_district:String(data.get("district")||"").trim(),
    p_delivery_instructions:String(data.get("instructions")||"").trim(),
    p_items:entries.map(({product,qty})=>({product_id:product.id,quantity:qty}))
  });
  if(error) {
    console.error("Could not create customer order:",error);
    showToast(error.message?.includes("awaiting payment")
      ?"You already have an order waiting for payment. Check your profile first."
      :"The order could not be placed. Refresh your cart and try again.");
    return;
  }
  const savedOrder=Array.isArray(orderRows)?orderRows[0]:orderRows;
  if(!savedOrder?.order_id||!savedOrder?.order_reference) {
    console.error("Order creation returned an invalid response:",orderRows);
    showToast("The order could not be confirmed. Check your profile before trying again.");
    return;
  }
  const {data:createdOrder,error:readError}=await state.supabase.from("store_orders")
    .select("id,reference,total_lkr,payment_status,delivery_status,created_at")
    .eq("id",savedOrder.order_id).single();
  if(readError) {
    console.error("Order was created but could not be loaded:",readError);
    showToast("Your order was saved. Refresh your profile to see its payment details.");
    return;
  }
  state.currentOrder=createdOrder;
  state.cart={};
  saveCart();
  updateCartBadge();
  await loadCustomerOrders();
  setView("payment");
}
async function markOrderPaymentSent() {
  const order=state.currentOrder;
  if(!order||!state.supabase||!["awaiting_payment","rejected"].includes(order.payment_status)) return;
  const {error}=await state.supabase.rpc("customer_mark_payment_sent",{p_order_id:order.id});
  if(error) {
    console.error("Could not notify the store that a payment was sent:",error);
    showToast("Your payment notification could not be saved. Please retry.");
    return;
  }
  state.currentOrder={...order,payment_status:"awaiting_approval"};
  renderPayment();
  await loadCustomerOrders();
  showToast("Payment notification sent. Now send the receipt to WhatsApp.");
}
function viewCustomerOrder(orderId) {
  const order=state.customerOrders.find(item=>item.id===orderId);
  if(!order) return;
  state.currentOrder=order;
  setView("payment");
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
  selectAdminSection(state.adminSection);
  const draftBar=document.getElementById("admin-draft-bar");
  const draftMessage=document.getElementById("admin-draft-message");
  const draftActions=document.getElementById("admin-draft-actions");
  draftBar.hidden=!state.catalogDraftError&&(!state.catalogDraft||!hasCatalogDraftChanges());
  draftActions.hidden=state.catalogDraftError||!hasCatalogDraftChanges();
  draftMessage.textContent=state.catalogDraftError
    ?"A saved local draft could not be loaded. Draft editing is disabled so it cannot be overwritten."
    :state.catalogDraft&&hasCatalogDraftChanges()
      ?"Your changes are saved in this browser only. Review the shop preview, then publish when ready."
      :"";
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
function renderProfile() {
  const user=state.session?.user;
  if(!user) return;
  const metadata=user.user_metadata||{};
  const email=user.email||"";
  const fullName=String(metadata.full_name||metadata.name||email.split("@")[0]||"Your profile").trim();
  const firstName=fullName.split(/\s+/)[0]||"back";
  document.getElementById("profile-first-name").textContent=`${firstName}.`;
  document.getElementById("profile-name").textContent=fullName;
  document.getElementById("profile-email").textContent=email;
  const initials=document.getElementById("profile-initials");
  initials.textContent=firstName.slice(0,1).toUpperCase();
  document.getElementById("profile-admin-card").hidden=!state.adminAuthorized;
  updateCartBadge();
}
const paymentStatusLabels={
  awaiting_payment:"Waiting for payment",
  awaiting_approval:"Waiting for payment approval",
  approved:"Payment approved",
  rejected:"Payment not approved"
};
const deliveryStatusLabels={
  product_packed:"Product Packed",
  waiting_for_shipment:"Waiting for shipment",
  handed_to_delivery:"Handed to delivery",
  out_for_delivery:"Out for delivery",
  delivered:"Delivered"
};
function paymentStatusLabel(status) { return paymentStatusLabels[status]||"Order status unavailable"; }
function deliveryStatusLabel(status) { return deliveryStatusLabels[status]||"Not started"; }
function renderCustomerOrders() {
  const target=document.getElementById("customer-orders-list");
  if(!target) return;
  if(!state.customerOrders.length) {
    target.innerHTML=`<p class="profile-note">You have no orders yet. Orders you place will appear here.</p>`;
    return;
  }
  target.innerHTML=state.customerOrders.map(order=>
    `<article class="customer-order-card"><div class="customer-order-heading"><div><strong>${escapeHTML(order.reference)}</strong><small>${new Date(order.created_at).toLocaleDateString("en-LK",{year:"numeric",month:"short",day:"numeric"})}</small></div><strong>${lkr.format(order.total_lkr)}</strong></div><p><span>Payment:</span> ${escapeHTML(paymentStatusLabel(order.payment_status))}</p><p><span>Delivery:</span> ${escapeHTML(deliveryStatusLabel(order.delivery_status))}</p><small class="customer-order-items">${(order.items||[]).map(item=>`${escapeHTML(item.product_name)} × ${item.quantity}`).join(", ")}</small><button type="button" class="text-button" data-action="view-order-payment" data-id="${escapeHTML(order.id)}">View order and payment <span>→</span></button></article>`
  ).join("");
}
async function loadCustomerOrders() {
  const customerId=state.session?.user?.id;
  if(!state.supabase||!customerId) return;
  const target=document.getElementById("customer-orders-list");
  if(target) target.innerHTML=`<p class="profile-note">Loading your orders…</p>`;
  const {data,error}=await state.supabase.from("store_orders")
    .select("id,reference,customer_name,customer_email,customer_phone,delivery_address,delivery_city,delivery_district,delivery_instructions,subtotal_lkr,delivery_fee_lkr,total_lkr,payment_status,delivery_status,created_at,items:store_order_items(id,product_name,product_image,quantity,unit_price_lkr,line_total_lkr)")
    .eq("customer_id",customerId)
    .order("created_at",{ascending:false});
  if(error) {
    console.error("Could not load customer orders:",error);
    if(target) target.innerHTML=`<p class="profile-note is-error">Order history could not be loaded. Apply the orders database migration and try again.</p>`;
    return;
  }
  if(state.session?.user?.id!==customerId) return;
  state.customerOrders=data||[];
  renderCustomerOrders();
}
function selectAdminSection(section) {
  if(!state.adminAuthorized||!["products","general","logo","orders"].includes(section)) return;
  state.adminSection=section;
  document.querySelectorAll(".admin-tab").forEach(tab=>{
    const active=tab.dataset.adminSection===section;
    tab.classList.toggle("is-active",active);
    tab.setAttribute("aria-current",active?"page":"false");
  });
  document.querySelectorAll(".admin-section").forEach(page=>{
    page.classList.toggle("is-active",page.id===`admin-${section}-section`);
  });
  if(section==="general") void loadStoreSettings(true);
  if(section==="logo") applyStoreLogo(state.storeSettings.logo_path,state.storeSettings.logo_updated_at);
  if(section==="orders") void loadAdminOrders();
}
async function loadStoreSettings(showError=false) {
  if(!state.supabase) return false;
  const status=document.getElementById("delivery-fee-status");
  const {data,error}=await state.supabase.from("store_settings").select("delivery_fee_lkr,logo_path,logo_updated_at").eq("id",true).single();
  if(error) {
    console.error("Could not load store delivery settings:",error);
    if(status) status.textContent="Store settings could not be loaded. Apply the orders and settings migration.";
    if(showError) showAdminFeedback("Store delivery settings could not be loaded. Check the Supabase migration and connection.",true);
    return false;
  }
  state.storeSettings=data;
  applyStoreLogo(data.logo_path,data.logo_updated_at);
  const input=document.getElementById("delivery-fee");
  if(input) input.value=String(data.delivery_fee_lkr);
  if(status) status.textContent=`Current fee: ${data.delivery_fee_lkr===0?"Free":lkr.format(data.delivery_fee_lkr)}.`;
  if(state.currentView==="cart") renderCart();
  if(state.currentView==="checkout") renderCheckout();
  return true;
}
async function saveDeliveryFee(form) {
  if(!state.adminAuthorized||!state.supabase) return;
  const fee=Number(new FormData(form).get("deliveryFee"));
  if(!Number.isSafeInteger(fee)||fee<0||fee>1000000) {
    showAdminFeedback("Enter a delivery fee between LKR 0 and LKR 1,000,000.",true);
    return;
  }
  const {error}=await state.supabase.rpc("admin_update_store_settings",{p_delivery_fee_lkr:fee});
  if(error) {
    console.error("Could not save store delivery settings:",error);
    showAdminFeedback("Delivery fee could not be saved. Apply the orders and settings migration, then try again.",true);
    return;
  }
  state.storeSettings={...state.storeSettings,delivery_fee_lkr:fee};
  const status=document.getElementById("delivery-fee-status");
  status.textContent=`Delivery fee saved: ${fee===0?"Free":lkr.format(fee)}. New orders will use this fee.`;
  showAdminFeedback("Delivery fee updated. Existing orders keep their original fee.");
}
function renderAdminOrders() {
  const target=document.getElementById("admin-orders-list");
  if(!target) return;
  const pendingCount=state.adminOrders.filter(order=>order.payment_status==="awaiting_approval").length;
  const badge=document.getElementById("admin-order-badge");
  badge.textContent=String(pendingCount);
  badge.hidden=pendingCount===0;
  if(!state.adminOrders.length) {
    target.innerHTML=`<p class="admin-empty">No customer orders yet.</p>`;
    return;
  }
  target.innerHTML=state.adminOrders.map(order=>{
    const items=(order.items||[]).map(item=>`${escapeHTML(item.product_name)} × ${item.quantity}`).join(", ");
    const paymentActions=order.payment_status==="awaiting_approval"
      ?`<div class="order-actions"><button class="button button-primary" type="button" data-action="review-payment" data-id="${escapeHTML(order.id)}" data-approved="true">Approve payment</button><button class="button order-reject-button" type="button" data-action="review-payment" data-id="${escapeHTML(order.id)}" data-approved="false">Reject</button></div>`
      :"";
    const nextDelivery={
      product_packed:"waiting_for_shipment",
      waiting_for_shipment:"handed_to_delivery",
      handed_to_delivery:"out_for_delivery",
      out_for_delivery:"delivered"
    }[order.delivery_status];
    const deliveryAction=order.payment_status==="approved"&&nextDelivery
      ?`<button class="button button-primary" type="button" data-action="advance-delivery" data-id="${escapeHTML(order.id)}" data-status="${nextDelivery}">Mark ${escapeHTML(deliveryStatusLabel(nextDelivery))}</button>`
      :"";
    return `<article class="admin-order-card"><div class="admin-order-heading"><div><span class="eyebrow">ORDER</span><h3>${escapeHTML(order.reference)}</h3><small>${new Date(order.created_at).toLocaleString("en-LK")}</small></div><strong>${lkr.format(order.total_lkr)}</strong></div><div class="admin-order-grid"><div><span>Customer</span><strong>${escapeHTML(order.customer_name)}</strong><a href="mailto:${escapeHTML(order.customer_email)}">${escapeHTML(order.customer_email)}</a><a href="tel:${escapeHTML(order.customer_phone)}">${escapeHTML(order.customer_phone)}</a></div><div><span>Delivery address</span><strong>${escapeHTML(order.delivery_address)}</strong><small>${escapeHTML(order.delivery_city)}, ${escapeHTML(order.delivery_district)}</small>${order.delivery_instructions?`<small>Note: ${escapeHTML(order.delivery_instructions)}</small>`:""}</div></div><p class="admin-order-items">${items}</p><div class="admin-order-statuses"><span>Payment: <strong>${escapeHTML(paymentStatusLabel(order.payment_status))}</strong></span><span>Delivery: <strong>${escapeHTML(deliveryStatusLabel(order.delivery_status))}</strong></span><span>Delivery fee: <strong>${lkr.format(order.delivery_fee_lkr)}</strong></span></div>${paymentActions||deliveryAction?`<div class="order-actions">${paymentActions}${deliveryAction}</div>`:""}</article>`;
  }).join("");
}
async function loadAdminOrders(showNewOrderAlert=false) {
  if(!state.adminAuthorized||!state.supabase) return;
  const target=document.getElementById("admin-orders-list");
  const {data,error}=await state.supabase.from("store_orders")
    .select("id,reference,customer_name,customer_email,customer_phone,delivery_address,delivery_city,delivery_district,delivery_instructions,subtotal_lkr,delivery_fee_lkr,total_lkr,payment_status,delivery_status,created_at,items:store_order_items(id,product_name,product_image,quantity,unit_price_lkr,line_total_lkr)")
    .order("created_at",{ascending:false});
  if(error) {
    console.error("Could not load store orders:",error);
    if(target) target.innerHTML=`<p class="admin-empty">Orders could not be loaded. Apply the orders and settings migration, then refresh.</p>`;
    return;
  }
  if(!state.adminAuthorized) return;
  const orderIds=new Set(data.map(order=>order.id));
  if(showNewOrderAlert&&state.knownAdminOrderIds) {
    const newOrders=data.filter(order=>!state.knownAdminOrderIds.has(order.id));
    if(newOrders.length) showToast(`${newOrders.length} new customer ${newOrders.length===1?"order":"orders"} received.`);
  }
  state.knownAdminOrderIds=orderIds;
  state.adminOrders=data||[];
  renderAdminOrders();
}
async function reviewStorePayment(orderId,approved) {
  if(!state.adminAuthorized||!window.confirm(approved?"Confirm you checked the payment receipt and the money arrived?":"Reject this payment and ask the customer to contact the store?")) return;
  const {error}=await state.supabase.rpc("admin_review_store_payment",{p_order_id:orderId,p_approved:approved});
  if(error) {
    console.error("Could not update the order payment status:",error);
    showAdminFeedback("Payment status could not be updated. Refresh the orders list and try again.",true);
    return;
  }
  await loadAdminOrders();
  showAdminFeedback(approved?"Payment approved; delivery starts at Product Packed.":"Payment marked as rejected.");
}
async function advanceDeliveryStatus(orderId,status) {
  if(!state.adminAuthorized) return;
  const {error}=await state.supabase.rpc("admin_update_store_delivery_status",{p_order_id:orderId,p_delivery_status:status});
  if(error) {
    console.error("Could not update the order delivery status:",error);
    showAdminFeedback("Delivery status could not be updated. Refresh the orders list and try again.",true);
    return;
  }
  await loadAdminOrders();
  showAdminFeedback(`Order delivery updated: ${deliveryStatusLabel(status)}.`);
}

async function loadStoreData() {
  const {data:categoryRows,error:categoryError}=await state.supabase.from("store_categories").select("id,name").order("name");
  if(categoryError) throw categoryError;
  const {data:productRows,error:productError}=await state.supabase.from("store_products").select("id,name,category_id,price_lkr,stock_quantity,badge,featured,image_url,description,category:store_categories!inner(name)").order("created_at",{ascending:false});
  if(productError) throw productError;
  state.loadedCategories=categoryRows.map(row=>({id:row.id,name:row.name}));
  categories=state.loadedCategories.map(row=>row.name);
  products=productRows.map(row=>({
    id:row.id,
    categoryId:row.category_id,
    name:row.name,
    category:row.category.name,
    price:Number(row.price_lkr),
    stock:row.stock_quantity,
    badge:row.badge||"",
    featured:row.featured,
    image:row.image_url,
    description:row.description
  }));
  state.loadedProducts=products.map(product=>({...product}));
  state.storeLoaded=true;
  state.catalogUnavailable=false;
  state.catalogIsDemo=false;
  state.catalogDraft=null;
  state.catalogDraftError=false;
  if(state.adminAuthorized&&state.session?.user?.id) {
    try {
      state.catalogDraft=readCatalogDraft(state.session.user.id);
      if(state.catalogDraft) applyCatalogDraftPreview(state.catalogDraft);
    } catch(error) {
      console.error("Could not restore the local store draft:",error);
      state.catalogDraftError=true;
      showAdminFeedback("A saved local draft could not be loaded. Draft editing is disabled to protect it. Check this browser's local storage before continuing.",true);
    }
  }
  renderFeatured();
  renderHomeCategories();
  renderCatalog();
  if(state.currentView==="admin") renderAdmin();
}

function catalogDraftStorageKey(userId) { return `nexon-store-catalog-draft:${userId}`; }
function categorySnapshot(items) {
  return items.map(item=>({id:item.id,name:item.name})).sort((left,right)=>left.id<right.id?-1:left.id>right.id?1:0);
}
function productSnapshot(items) {
  return items.map(product=>({
    id:product.id,
    name:product.name,
    category_id:product.categoryId,
    price_lkr:product.price,
    stock_quantity:product.stock,
    badge:product.badge,
    featured:product.featured,
    image_url:product.image,
    description:product.description
  })).sort((left,right)=>left.id<right.id?-1:left.id>right.id?1:0);
}
function hasCatalogDraftChanges(draft=state.catalogDraft) {
  if(!draft) return false;
  return JSON.stringify(categorySnapshot(draft.categories))!==JSON.stringify(draft.baseCategories)||
    JSON.stringify(productSnapshot(draft.products))!==JSON.stringify(draft.baseProducts);
}
function getCatalogDraftChangeCount(draft=state.catalogDraft) {
  if(!draft) return 0;
  const categoryChanges=JSON.stringify(categorySnapshot(draft.categories))===JSON.stringify(draft.baseCategories)?0:1;
  const productChanges=JSON.stringify(productSnapshot(draft.products))===JSON.stringify(draft.baseProducts)?0:1;
  return categoryChanges+productChanges;
}
function readCatalogDraft(userId) {
  const saved=localStorage.getItem(catalogDraftStorageKey(userId));
  if(saved===null) return null;
  const draft=JSON.parse(saved);
  if(!draft||draft.version!==1||draft.userId!==userId||!Array.isArray(draft.baseCategories)||
    !Array.isArray(draft.baseProducts)||!Array.isArray(draft.categories)||!Array.isArray(draft.products)) {
    throw new Error("The saved store draft has an unsupported or incomplete format.");
  }
  const validId=id=>typeof id==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  const validCategory=category=>validId(category?.id)&&typeof category.name==="string"&&category.name.length>=1&&category.name.length<=32;
  const validProduct=product=>validId(product?.id)&&validId(product.category_id)&&typeof product.name==="string"&&
    Number.isSafeInteger(product.price_lkr)&&product.price_lkr>0&&Number.isInteger(product.stock_quantity)&&product.stock_quantity>=0&&
    typeof product.badge==="string"&&typeof product.featured==="boolean"&&typeof product.image_url==="string"&&typeof product.description==="string";
  const validDraftProduct=product=>validId(product?.id)&&validId(product.categoryId)&&typeof product.category==="string"&&
    typeof product.name==="string"&&Number.isSafeInteger(product.price)&&product.price>0&&Number.isInteger(product.stock)&&product.stock>=0&&
    typeof product.badge==="string"&&typeof product.featured==="boolean"&&typeof product.image==="string"&&typeof product.description==="string";
  if(!draft.baseCategories.every(validCategory)||!draft.categories.every(validCategory)||
    !draft.baseProducts.every(validProduct)||!draft.products.every(validDraftProduct)) {
    throw new Error("The saved store draft contains invalid catalog entries.");
  }
  return draft;
}
function createCatalogDraft() {
  const userId=state.session?.user?.id;
  if(!userId) return null;
  const baseCategories=categorySnapshot(state.loadedCategories);
  const baseProducts=productSnapshot(state.loadedProducts);
  return {
    version:1,
    userId,
    baseCategories,
    baseProducts,
    categories:state.loadedCategories.map(category=>({...category})),
    products:state.loadedProducts.map(product=>({...product}))
  };
}
function cloneCatalogDraft(draft) {
  return {
    version:draft.version,
    userId:draft.userId,
    baseCategories:draft.baseCategories.map(category=>({...category})),
    baseProducts:draft.baseProducts.map(product=>({...product})),
    categories:draft.categories.map(category=>({...category})),
    products:draft.products.map(product=>({...product}))
  };
}
function applyCatalogDraftPreview(draft) {
  categories=draft.categories.map(category=>category.name);
  products=draft.products.map(product=>({...product}));
  if(state.category!=="All"&&!categories.includes(state.category)) state.category="All";
}
function restorePublishedCatalogPreview() {
  state.catalogDraft=null;
  state.catalogDraftError=false;
  categories=state.loadedCategories.map(category=>category.name);
  products=state.loadedProducts.map(product=>({...product}));
  if(state.storeLoaded) {
    renderFeatured();
    renderHomeCategories();
    renderCatalog();
    renderCart();
    updateCartBadge();
  }
}
function refreshCatalogPreview() {
  renderFeatured();
  renderHomeCategories();
  renderCatalog();
  renderCart();
  updateCartBadge();
  if(state.currentView==="admin") renderAdmin();
}
function stageCatalogDraft(draft) {
  if(state.catalogDraftError) {
    showAdminFeedback("The saved local draft could not be read. Draft editing is disabled to protect it.",true);
    return false;
  }
  try {
    localStorage.setItem(catalogDraftStorageKey(draft.userId),JSON.stringify(draft));
  } catch(error) {
    console.error("Could not save the local store draft:",error);
    showAdminFeedback("This browser could not save the draft. Your change was not applied.",true);
    return false;
  }
  state.catalogDraft=draft;
  applyCatalogDraftPreview(draft);
  refreshCatalogPreview();
  return true;
}
function newCatalogId() {
  if(!window.crypto?.randomUUID) {
    showAdminFeedback("This browser cannot create secure draft IDs. Update your browser and try again.",true);
    return null;
  }
  return window.crypto.randomUUID();
}

function isGoogleAccount(user) {
  const providers=user?.app_metadata?.providers||[];
  return user?.app_metadata?.provider==="google"||providers.includes("google");
}
async function updateAuthState(session) {
  state.session=session;
  updateAccountButton(session);
  state.adminAuthorized=false;
  restorePublishedCatalogPreview();
  state.authReady=false;
  setAdminLinksVisible(false);
  document.getElementById("admin-layout").hidden=true;
  if(state.adminOrderPollTimer) {
    clearInterval(state.adminOrderPollTimer);
    state.adminOrderPollTimer=null;
  }
  if(!session?.user) {
    state.authReady=true;
    state.adminMessage=state.supabase
      ?"Sign in with Google to manage your account and track orders. Store admin access is restricted."
      :"Secure Google sign-in is not configured yet. Complete the setup steps in README.md.";
    if(state.pendingAdminRoute) {state.pendingAdminRoute=false;state.pendingAuthView="admin";setView("admin-login");}
    else if(state.pendingAuthView) setView("admin-login");
    else if(state.currentView==="admin") setView("admin-login");
    else if(state.currentView==="admin-login") renderAdminLogin();
    else if(state.currentView==="profile"||state.currentView==="checkout") setView("admin-login");
    return;
  }
  if(!isGoogleAccount(session.user)) {
    state.authReady=true;
    state.adminMessage="Use a Google account to sign in.";
    setAdminLinksVisible(false);
    if(state.pendingAdminRoute||state.currentView==="admin-login"||state.currentView==="admin"||state.currentView==="profile"||state.currentView==="checkout") {
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
    if(state.currentView==="admin") setView("profile");
    else renderAdminLogin();
    return;
  }
  const {data:hasAdminRole,error:roleError}=roleResult;
  if(errorRoleChanged(session)) return;
  if(roleError) {
    console.error("Secure store administrator role check failed:",roleError);
    state.authReady=true;
    state.adminMessage="Secure admin access could not be verified. Contact the store administrator.";
    if(state.currentView==="admin") setView("profile");
    else renderAdminLogin();
    return;
  }
  state.adminAuthorized=hasAdminRole===true;
  state.authReady=true;
  state.adminMessage=state.adminAuthorized
    ?`Verified administrator: ${session.user.email}`
    :`Signed in as ${session.user.email||"Google account"}.`;
  setAdminLinksVisible(state.adminAuthorized);
  if(state.adminAuthorized) {
    try {
      state.storeLoaded=false;
      await loadStoreData();
      await loadStoreSettings();
      await loadAdminOrders();
      state.adminOrderPollTimer=setInterval(()=>{void loadAdminOrders(true);},30000);
    } catch(error) {
      console.error("Could not load store management data:",error);
      state.storeLoaded=false;
      showAdminFeedback("Store data could not be loaded. Check the Supabase database migration and connection, then retry.",true);
    }
  } else {
    await loadCustomerOrders();
  }
  if(errorRoleChanged(session)) return;
  if(state.pendingAdminRoute) {
    state.pendingAdminRoute=false;
    if(state.adminAuthorized) setView("admin");
    else {
      state.pendingAuthView=null;
      setView("profile");
      showToast("Store administration is available only to the approved admin account.");
    }
  } else if(state.pendingAuthView) {
    const requested=state.pendingAuthView;
    state.pendingAuthView=null;
    setView(requested==="admin"&&!state.adminAuthorized?"profile":requested);
  } else if(state.currentView==="admin-login") {
    setView(state.adminAuthorized?"profile":"profile");
  } else if(state.currentView==="admin"&&!state.adminAuthorized) {
    setView("profile");
  } else if(state.currentView==="profile") {
    renderProfile();
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
  await loadStoreSettings();
  await updateAuthState(data.session);
}
async function startGoogleLogin() {
  if(!state.supabase) {setAdminMessage("Secure Google sign-in is not configured. Follow the Supabase setup instructions in README.md.",true);renderAdminLogin();return;}
  setAdminMessage("Redirecting to Google for secure sign-in…");
  const returnView=state.pendingAuthView||"profile";
  const redirectTo=`${location.origin}${location.pathname}#${returnView}`;
  let result;
  try {
    result=await state.supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo,scopes:"openid email profile",queryParams:{prompt:"select_account"}}});
  } catch(error) {
    console.error("Google sign-in could not reach Supabase:",error);
    setAdminMessage("Google sign-in could not start. Check your network and the OAuth configuration.",true);
    renderAdminLogin();
    return;
  }
  const {error}=result;
  if(error) {
    console.error("Google sign-in failed:",error);
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
    console.error("Account sign-out could not reach Supabase:",error);
    showToast("Sign-out failed because the authentication server could not be reached. Please retry.");
    return;
  }
  const {error}=result;
  if(error) {
    console.error("Could not sign out of the account:",error);
    showToast("Sign-out failed. Please retry.");
    return;
  }
  state.session=null;
  state.adminAuthorized=false;
  restorePublishedCatalogPreview();
  updateAccountButton(null);
  setAdminLinksVisible(false);
  setView("home");
}
async function addCategory(rawName) {
  const name=rawName.trim().slice(0,32);
  if(!name) {showAdminFeedback("Enter a category name.",true);return false;}
  if(categories.some(category=>category.toLowerCase()===name.toLowerCase())) {showAdminFeedback("That category already exists.",true);return false;}
  const id=newCatalogId();
  if(!id) return false;
  const draft=state.catalogDraft?cloneCatalogDraft(state.catalogDraft):createCatalogDraft();
  if(!draft) {showAdminFeedback("Sign in again before editing the store.",true);return false;}
  draft.categories.push({id,name});
  if(!stageCatalogDraft(draft)) return false;
  showToast(`${name} saved as a local draft.`);
  return true;
}
async function renameCategory(previousName,rawName) {
  const name=rawName.trim().slice(0,32);
  if(!name) {showAdminFeedback("Category names cannot be empty.",true);renderAdmin();return;}
  if(categories.some(category=>category!==previousName&&category.toLowerCase()===name.toLowerCase())) {showAdminFeedback("A category with that name already exists.",true);renderAdmin();return;}
  const draft=state.catalogDraft?cloneCatalogDraft(state.catalogDraft):createCatalogDraft();
  if(!draft) {showAdminFeedback("Sign in again before editing the store.",true);return;}
  const category=draft.categories.find(item=>item.name===previousName);
  if(!category) return;
  category.name=name;
  draft.products.forEach(product=>{if(product.categoryId===category.id) product.category=name;});
  if(!stageCatalogDraft(draft)) return;
  showToast("Category name saved as a local draft.");
}
async function deleteCategory(category) {
  if(categories.length<=1) {showAdminFeedback("Keep at least one category in your shop.",true);return;}
  const replacement=categories.find(item=>item!==category);
  if(!window.confirm(`Delete "${category}"? Products in this category will be moved to "${replacement}".`)) return;
  const draft=state.catalogDraft?cloneCatalogDraft(state.catalogDraft):createCatalogDraft();
  if(!draft) {showAdminFeedback("Sign in again before editing the store.",true);return;}
  const target=draft.categories.find(item=>item.name===category);
  const destination=draft.categories.find(item=>item.name===replacement);
  if(!target||!destination) {showAdminFeedback("A category could not be found. Refresh and try again.",true);return;}
  draft.products.forEach(product=>{
    if(product.categoryId===target.id) {
      product.categoryId=destination.id;
      product.category=destination.name;
    }
  });
  draft.categories=draft.categories.filter(item=>item.id!==target.id);
  if(!stageCatalogDraft(draft)) return;
  showToast(`Category removal saved locally. Products will move to ${replacement} when published.`);
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
  const draft=state.catalogDraft?cloneCatalogDraft(state.catalogDraft):createCatalogDraft();
  const categoryRow=draft?.categories.find(item=>item.name===category);
  if(!draft||!categoryRow) {showAdminFeedback("Could not find that product category. Refresh and try again.",true);return;}
  const id=existing?.id||newCatalogId();
  if(!id) return;
  const product={
    id,
    categoryId:categoryRow.id,
    name,
    category,
    price,
    stock,
    badge:String(data.get("badge")||"").trim().slice(0,24),
    featured:data.get("featured")==="on",
    image:imageInput||(existing?existing.image:"assets/home-storage-basket.svg"),
    description:description.slice(0,240)
  };
  const existingIndex=draft.products.findIndex(item=>item.id===id);
  if(existingIndex<0) draft.products.unshift(product);
  else draft.products[existingIndex]=product;
  if(!stageCatalogDraft(draft)) return;
  resetProductForm();
  showToast(existing?"Product changes saved locally.":"Product saved locally. Not published yet.");
}
async function deleteProduct(id) {
  const product=getProduct(id);
  if(!product||!window.confirm(`Delete "${product.name}" from your product list?`)) return;
  const draft=state.catalogDraft?cloneCatalogDraft(state.catalogDraft):createCatalogDraft();
  if(!draft) {showAdminFeedback("Sign in again before editing the store.",true);return;}
  draft.products=draft.products.filter(item=>item.id!==id);
  if(!stageCatalogDraft(draft)) return;
  if(state.editingProduct===id) resetProductForm();
  showToast("Product removal saved locally. It is not published yet.");
}
async function publishCatalogDraft() {
  const draft=state.catalogDraft;
  if(!draft||!hasCatalogDraftChanges(draft)) return;
  if(!state.supabase||!state.adminAuthorized||!state.session?.user?.id) {
    showAdminFeedback("Administrator authorization is required before publishing.",true);
    return;
  }
  const changes=getCatalogDraftChangeCount(draft);
  if(!window.confirm(`Publish your saved catalog changes to the live shop now? The public website will update. Changes: ${changes} catalog section${changes===1?"":"s"}.`)) return;
  let result;
  try {
    result=await state.supabase.rpc("admin_publish_store_catalog",{
      expected_categories:draft.baseCategories,
      expected_products:draft.baseProducts,
      target_categories:categorySnapshot(draft.categories),
      target_products:productSnapshot(draft.products)
    });
  } catch(error) {
    console.error("Could not publish the store catalog:",error);
    showAdminFeedback("The catalog could not be published because the database could not be reached. Your local draft is preserved.",true);
    return;
  }
  if(result.error) {
    console.error("The store catalog publish request failed:",result.error);
    if(String(result.error.message||"").includes("changed since this draft")) {
      showAdminFeedback("The live catalog changed after this draft was started. Your draft is preserved but cannot overwrite newer changes. Discard it, reload the live catalog, and reapply your edits.",true);
    } else {
      showAdminFeedback("The database rejected this publish. Your local draft is preserved; check the database migration and try again.",true);
    }
    return;
  }
  try {
    localStorage.removeItem(catalogDraftStorageKey(draft.userId));
  } catch(error) {
    console.error("The catalog was published, but its local draft could not be cleared:",error);
    state.catalogDraft=null;
    state.catalogDraftError=true;
    showAdminFeedback("The catalog is live, but this browser could not clear its saved draft. Draft editing is disabled to protect it.",true);
    return;
  }
  state.catalogDraft=null;
  state.catalogDraftError=false;
  try {
    await loadStoreData();
    deleteInvalidCartItems();
    refreshCatalogPreview();
    showAdminFeedback("Your catalog updates are now published on the live shop.");
  } catch(error) {
    console.error("The catalog was published, but could not be refreshed:",error);
    showAdminFeedback("Your catalog was published, but this page could not refresh the live data. Reload before making more changes.",true);
  }
}
async function discardCatalogDraft() {
  const draft=state.catalogDraft;
  if(!draft||!window.confirm("Discard all unpublished catalog changes saved in this browser?")) return;
  try {
    localStorage.removeItem(catalogDraftStorageKey(draft.userId));
  } catch(error) {
    console.error("Could not discard the local store draft:",error);
    showAdminFeedback("This browser could not remove the local draft. No changes were discarded.",true);
    return;
  }
  state.catalogDraft=null;
  state.catalogDraftError=false;
  try {
    await loadStoreData();
    refreshCatalogPreview();
    showAdminFeedback("The unpublished draft was discarded. The live catalog is shown.");
  } catch(error) {
    console.error("Could not reload the live catalog after discarding the draft:",error);
    showAdminFeedback("The draft was discarded, but the live catalog could not be reloaded. Refresh the page before continuing.",true);
  }
}
function deleteInvalidCartItems() {
  for(const [id,quantity] of Object.entries(state.cart)) {
    const product=getProduct(id);
    if(!product||product.stock===0) delete state.cart[id];
    else if(quantity>product.stock) state.cart[id]=product.stock;
  }
  saveCart();
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
      if(state.session?.user) setView("profile");
      else document.getElementById("login-modal").hidden=false;
      break;
    case "close-modal": closeModals();break;
    case "search": searchProducts();break;
    case "clear-filters": state.search="";state.category="All";renderCatalog();break;
    case "delete-category": void deleteCategory(target.dataset.category);break;
    case "edit-product": editProduct(target.dataset.id);break;
    case "delete-product": void deleteProduct(target.dataset.id);break;
    case "publish-catalog": void publishCatalogDraft();break;
    case "discard-catalog": void discardCatalogDraft();break;
    case "cancel-product-edit": resetProductForm();break;
    case "admin-google-login": void startGoogleLogin();break;
    case "customer-google-login":
      state.pendingAuthView=state.pendingAuthView||"profile";
      setView("admin-login");
      void startGoogleLogin();
      break;
    case "refresh-customer-orders": void loadCustomerOrders();break;
    case "refresh-admin-orders": void loadAdminOrders();break;
    case "customer-mark-paid": void markOrderPaymentSent();break;
    case "view-order-payment": viewCustomerOrder(target.dataset.id);break;
    case "review-payment": void reviewStorePayment(target.dataset.id,target.dataset.approved==="true");break;
    case "advance-delivery": void advanceDeliveryStatus(target.dataset.id,target.dataset.status);break;
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
document.getElementById("delivery-settings-form").addEventListener("submit",event=>{
  event.preventDefault();
  void saveDeliveryFee(event.currentTarget);
});
document.getElementById("store-logo-file").addEventListener("change",event=>{
  previewStoreLogo(event.currentTarget.files?.[0]||null);
});
document.getElementById("logo-form").addEventListener("submit",event=>{
  event.preventDefault();
  void publishStoreLogo(event.currentTarget);
});
document.querySelector(".admin-tabs").addEventListener("click",event=>{
  const tab=event.target.closest("[data-admin-section]");
  if(tab) selectAdminSection(tab.dataset.adminSection);
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
  void placeStoreOrder(event.currentTarget);
});

document.getElementById("year").textContent=new Date().getFullYear();
renderFeatured();
renderHomeCategories();
renderCatalog();
updateCartBadge();
setAdminLinksVisible(false);
const initialHash=location.hash.slice(1);
if(initialHash==="admin"||initialHash==="admin/login") {
  state.pendingAdminRoute=true;
  state.pendingAuthView="admin";
}
else if(initialHash==="profile"||initialHash==="checkout") state.pendingAuthView=initialHash;
else if(views.includes(initialHash)&&initialHash!=="payment"&&initialHash!=="checkout") setView(initialHash);
window.addEventListener("hashchange",()=>{
  const hash=location.hash.slice(1);
  if(hash==="admin"||hash==="admin/login") {
    state.pendingAdminRoute=true;
    state.pendingAuthView="admin";
    if(state.authReady) {
      if(state.supabase) void updateAuthState(state.session);
      else {state.pendingAdminRoute=false;setView("admin-login");}
    }
  } else if(hash==="checkout"&&!state.session?.user) {
    state.pendingAuthView="checkout";
    setView("checkout");
  } else if(views.includes(hash)&&hash!=="payment"&&hash!=="checkout") {
    setView(hash);
  }
});
void initializeAuth();
