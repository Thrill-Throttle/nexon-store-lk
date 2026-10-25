# NEXON STORE LK

A responsive, blue-themed, general-products storefront for home, fashion, electronics, accessories and everyday finds. The website runs without a build step and uses the supplied store logo and LankaQR image.

## Run the website locally

1. Open this folder in Visual Studio Code.
2. Install and start the **Live Server** VS Code extension, then open `index.html` with Live Server. Use `http://127.0.0.1:5500` rather than opening the HTML as a `file://` URL; Google OAuth requires a registered HTTP website address.
3. Browsing, sample product filters and the preview shopping cart work before connecting Supabase.

Product artwork is included locally as SVG. Fonts and the Supabase JavaScript library are loaded from public CDNs, so online access is required for Google login and the selected fonts.

## Free GitHub repository and GitHub Pages hosting

The checked-in [GitHub Pages Actions workflow](./.github/workflows/deploy-pages.yml) publishes the storefront only when you manually run it. Pushing changes to `main` does not update the live website. This lets you review and test changes locally before choosing to publish. The workflow publishes only the website HTML, JavaScript, styles, configuration and required images; it does not publish the database migration or this setup guide.

1. Create a **public** GitHub repository named `nexon-store-lk`. A public repository and website are required for GitHub Pages on the Free plan. This makes the source, store logo, and payment QR publicly accessible. Orders are saved only after the Supabase setup and migrations in this guide are complete; payment is reviewed manually.
2. On your computer, install [Git for Windows](https://git-scm.com/download/win) and sign in to GitHub through VS Code's **Accounts** menu.
3. In VS Code, open the **Source Control** view, choose **Initialize Repository**, stage the website files, create the first commit, choose **Publish to GitHub**, and select the public `nexon-store-lk` repository. The local `.gitignore` excludes common secret and local-development files.
4. In the GitHub repository, open **Settings → Pages** and select **GitHub Actions** as the deployment source.
5. Before publishing a website update, run it locally with Live Server and check the changes in your browser. When you're ready to publish, open **Actions → Deploy storefront to GitHub Pages → Run workflow**, select `main`, and confirm **Run workflow**. The live website changes only after that workflow completes. View the published address under **Settings → Pages** or the finished deployment in **Actions**.
6. Update the Supabase **Authentication → URL Configuration** Site URL to your published Pages address (typically `https://YOUR_GITHUB_USERNAME.github.io/nexon-store-lk/`) and add that address to the allowed redirect URLs. The OAuth callback return path preserves the GitHub Pages repository subpath.

**Before creating the public repository, confirm that you want the supplied payment QR published on a public website.** A QR image is not a password; however, anyone can view or scan a publicly hosted merchant payment QR.

## Secure Google admin setup

The site uses Supabase Auth for customer email/password accounts and Google's OAuth provider. **The administrator role is granted by a trusted Postgres migration, never from the browser or an email input.** The database migration grants access only to the verified Google account `akileshan2023@gmail.com`. The browser displays the signed-in email only after the database has verified its admin role; supplying that email or changing browser data cannot grant access.

1. The existing Supabase project URL and its **publishable** key are already configured in `supabase-config.js`. These values are intentionally browser-visible. **Never put a Supabase `service_role` or secret key in this file, a web page, or a public repository.** If you rotate the publishable key, update that file with the replacement.

2. In Google Cloud Console, configure an OAuth client for a web application. Add the Live Server origin (typically `http://127.0.0.1:5500`) to its authorized JavaScript origins. Add the Supabase callback URL shown in the Supabase Google-provider settings to its authorized redirect URIs. If Google's OAuth consent screen is in testing mode, add `akileshan2023@gmail.com` as a test user.

3. In Supabase **Authentication → Providers → Google**, enable Google and enter the Google OAuth client ID and client secret. Keep the client secret only in the Supabase provider settings. In **Authentication → Providers → Email**, enable email/password sign-in and email confirmations; configure SMTP if you want reliable production verification and password-reset emails. Under **Authentication → URL Configuration**, set the local Site URL and add `http://127.0.0.1:5500/**` to the allowed redirect URLs. Add the production website origin before deployment. If Live Server uses a different port, use its actual origin instead.

4. In Supabase **SQL Editor**, run [`supabase/migrations/202610250001_secure_store_admin.sql`](./supabase/migrations/202610250001_secure_store_admin.sql), [`supabase/migrations/202610250002_publish_store_catalog_drafts.sql`](./supabase/migrations/202610250002_publish_store_catalog_drafts.sql), [`supabase/migrations/202610250003_orders_and_store_settings.sql`](./supabase/migrations/202610250003_orders_and_store_settings.sql), [`supabase/migrations/202610250004_store_logo_uploads.sql`](./supabase/migrations/202610250004_store_logo_uploads.sql), [`supabase/migrations/202610250005_allow_verified_email_customers.sql`](./supabase/migrations/202610250005_allow_verified_email_customers.sql), and [`supabase/migrations/202610250006_customer_contact_and_feedback.sql`](./supabase/migrations/202610250006_customer_contact_and_feedback.sql), in that order. The first migration creates the product and category tables, seeds the sample storefront products, applies Row Level Security, keeps administrator roles in a non-public schema, and grants the role only to the designated verified Google account. The second adds the admin-only atomic catalog-publishing function. The third creates customer orders, private order details, store delivery settings, and protected order/payment status functions. The fourth creates the public-read, admin-write logo storage bucket and restricts uploads to the store admin. The fifth allows any verified customer email provider to check out; only the approved verified Google account can be an administrator. The sixth creates a protected seller inbox for Contact page messages and one-time feedback from each customer's delivered orders.

5. In Supabase **Authentication → URL Configuration**, allow the production website address as a redirect URL. If Google's OAuth consent screen is in testing mode, add every tester Google account there.
6. Run the website with Live Server or your published Pages URL. Customers can create an email/password account (verify the email before signing in), sign in with that account or Google, and use the profile to place orders and see their own order statuses. The account dialog also supports password-reset emails. Store Admin is shown only for the designated administrator after the database role check succeeds; customer email accounts do not receive admin access. The admin has **Products**, **General settings**, **Orders**, and **Messages** pages. Set the flat delivery fee under General settings. The public Contact page sends name, email, and notes to **Messages**. Once an order is marked Delivered, its customer can send one feedback message from order history; it is also shown in **Messages**.

7. Test category and product changes as drafts before publishing. For an order-flow test, use a controlled test order and confirm that it is visible only to its customer and the authorized store admin. Check the payment receipt in WhatsApp before approving payment. Approval marks the order as **Product Packed**; advance it through **Waiting for shipment**, **Handed to delivery**, **Out for delivery**, and **Delivered**.

## Category and product management

After Supabase and Google OAuth are configured, sign in through **Store admin**. Add categories, assign new products to a category, edit product details and stock, and update category names. These edits are saved as a private draft in the current browser and previewed there; they do not change the shared catalog. When the preview is ready, choose **Publish updates** and confirm. Publishing updates the live catalog atomically. Drafts are not shared between browsers or devices. **Discard draft** removes unpublished changes from this browser.

Public visitors can read the catalog only. Database policies and administrator-only RPCs protect every category and product change; hiding the admin link is an additional interface detail, **not** the authorization boundary. Publishing verifies that the live catalog has not changed since the draft was started, and refuses to overwrite newer changes. The migration does not give browser clients permission to assign administrator roles.

## Customer orders, payment review, and delivery

Checkout requires a signed-in, email-verified customer account (Google or email/password) and saves the customer's name, verified email, phone, delivery address, city, district, optional instructions, item snapshots, totals, and delivery-fee snapshot to Supabase. Customers can read only their own orders; the authorized store admin can see and manage all orders. Order information is personal data: secure the Supabase project, limit dashboard access to the approved admin, and follow applicable data-retention requirements.

Submitting checkout creates an **Awaiting payment** order and displays the existing LankaQR. After paying, the customer chooses **I have paid** and sends the receipt to WhatsApp. Store Admin checks the receipt manually and approves or rejects it. The website does not verify bank transfers or send email/WhatsApp alerts automatically; new-order alerts appear in the Orders page while the admin dashboard is open. Payment approval starts delivery at **Product Packed** and reserves stock. The admin advances each order one delivery stage at a time. Customers sign into the same account to view payment and delivery progress. After an order is marked **Delivered**, the customer can send feedback once; the feedback appears in Store Admin → **Messages**.

The delivery fee defaults to **LKR 0** until changed in Store Admin → General settings. A fee change affects new orders only. Test email verification, sign-in, password reset, checkout, and account-specific order visibility before inviting customers to pay; a QR image can accept real money, and this workflow is manual.

### Using a Google Drive product photo

The product form accepts an image URL; it does not upload files to Drive or find files by name. To use a Drive photo, upload it to Drive, open **Share → General access**, choose **Anyone with the link → Viewer**, and copy its link. From a link shaped like `https://drive.google.com/file/d/FILE_ID/view?usp=sharing`, copy `FILE_ID` and use `https://drive.google.com/uc?export=view&id=FILE_ID` in the product's **Image URL** field. Open that URL in a private/incognito browser first to confirm it displays without signing in, then save the product as a draft and preview it. The photo must be publicly viewable for shop visitors; do not use this method for private photos. Drive may limit hotlinking or bandwidth, so a public image host or website-hosted image is more reliable for production.

## Remaining launch setup

Checkout now stores customer orders and supports manual payment approval and delivery tracking, but it is **not an automated payment system**. There is no bank/payment gateway verification, automatic receipt upload, email/WhatsApp notification, shipping-label creation, or order cancellation/refund workflow. Do not describe a payment as successful until the administrator has checked the receipt and confirmed funds arrived.
