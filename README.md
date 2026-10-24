# NEXON STORE LK

A responsive, blue-themed, general-products storefront for home, fashion, electronics, accessories and everyday finds. The website runs without a build step and uses the supplied store logo and LankaQR image.

## Run the website locally

1. Open this folder in Visual Studio Code.
2. Install and start the **Live Server** VS Code extension, then open `index.html` with Live Server. Use `http://127.0.0.1:5500` rather than opening the HTML as a `file://` URL; Google OAuth requires a registered HTTP website address.
3. Browsing, sample product filters and the preview shopping cart work before connecting Supabase.

Product artwork is included locally as SVG. Fonts and the Supabase JavaScript library are loaded from public CDNs, so online access is required for Google login and the selected fonts.

## Free GitHub repository and GitHub Pages hosting

The checked-in [GitHub Pages Actions workflow](./.github/workflows/deploy-pages.yml) automatically publishes the storefront when a change is pushed to `main`. It publishes only the website HTML, JavaScript, styles, configuration and required images; it does not publish the database migration or this setup guide.

1. Create a **public** GitHub repository named `nexon-store-lk`. A public repository and website are required for GitHub Pages on the Free plan. This makes the source and store logo and payment QR publicly accessible. The checkout is only a prototype: no customer orders or payments are processed.
2. On your computer, install [Git for Windows](https://git-scm.com/download/win) and sign in to GitHub through VS Code's **Accounts** menu.
3. In VS Code, open the **Source Control** view, choose **Initialize Repository**, stage the website files, create the first commit, choose **Publish to GitHub**, and select the public `nexon-store-lk` repository. The local `.gitignore` excludes common secret and local-development files.
4. In the GitHub repository, open **Settings → Pages**, select **GitHub Actions** as the deployment source, and open **Actions**. The workflow publishes the website when the first push to `main` starts. View the published address under **Settings → Pages** or the finished deployment in **Actions**.
5. Update the Supabase **Authentication → URL Configuration** Site URL to your published Pages address (typically `https://YOUR_GITHUB_USERNAME.github.io/nexon-store-lk/`) and add that address to the allowed redirect URLs. The OAuth callback return path preserves the GitHub Pages repository subpath.

**Before creating the public repository, confirm that you want the supplied payment QR published on a public website.** A QR image is not a password; however, anyone can view or scan a publicly hosted merchant payment QR.

## Secure Google admin setup

The admin panel uses Supabase Auth with Google's OAuth provider. **The administrator role is granted by a trusted Postgres migration, never from the browser or an email input.** The database migration grants access only to the verified Google account `akileshan2023@gmail.com`. The browser displays the signed-in email only after the database has verified its admin role; supplying that email or changing browser data cannot grant access.

1. The existing Supabase project URL and its **publishable** key are already configured in `supabase-config.js`. These values are intentionally browser-visible. **Never put a Supabase `service_role` or secret key in this file, a web page, or a public repository.** If you rotate the publishable key, update that file with the replacement.

2. In Google Cloud Console, configure an OAuth client for a web application. Add the Live Server origin (typically `http://127.0.0.1:5500`) to its authorized JavaScript origins. Add the Supabase callback URL shown in the Supabase Google-provider settings to its authorized redirect URIs. If Google's OAuth consent screen is in testing mode, add `akileshan2023@gmail.com` as a test user.

3. In Supabase **Authentication → Providers → Google**, enable Google and enter the Google OAuth client ID and client secret. Keep the client secret only in the Supabase provider settings. Under **Authentication → URL Configuration**, set the local Site URL and add `http://127.0.0.1:5500/**` to the allowed redirect URLs. Add the production website origin before deployment. If Live Server uses a different port, use its actual origin instead.

4. In Supabase **SQL Editor**, run [`supabase/migrations/202610250001_secure_store_admin.sql`](./supabase/migrations/202610250001_secure_store_admin.sql). It creates the product and category tables, seeds the sample storefront products, applies Row Level Security, keeps administrator roles in a non-public schema, and adds a trusted database trigger to grant the role to the designated verified Google account. If that Google account already exists, the migration also grants its role only if Supabase has already recorded its verified Google identity.

5. Run the website with Live Server or your published Pages URL. Open `#admin` (or select Store admin after signing in), and choose **Continue with Google**. Sign in with the designated Google account. The administrator email will appear in the secure dashboard, and the header account button will change to **My profile** and reopen the dashboard. Signing out returns the header to **Sign in**. Other accounts are denied. The admin navigation is shown only after the database role check succeeds. Customer accounts are not implemented; the header sign-in prompt explains that Google sign-in is reserved for store administration.

6. Test category management by adding a category and a product; confirm that they are visible from the public storefront in another browser. Do not create customer orders or request transfers until production checkout and payment verification have been implemented.

## Category and product management

After Supabase and Google OAuth are configured, sign in through **Store admin**. Add categories, assign new products to a category, edit product details and stock, and update category names. New categories appear in Shop and on the home page for every visitor because changes are stored in the shared database. Removing a category transactionally moves its products into another category.

Public visitors can read the catalog only. Database policies and administrator-only RPCs protect every category and product change; hiding the admin link is an additional interface detail, **not** the authorization boundary. The migration does not give browser clients permission to assign administrator roles.

## Remaining launch setup

This project still provides a storefront prototype, **not a complete order-processing system**. Checkout and payment instructions explicitly say no real order is placed. Customer authentication, saved carts, server-validated checkout, stock reservation, customer accounts, receipt storage, shipping rates, order management, and manual payment verification need to be built before taking orders or transfers. The configured QR may accept real money; verify the merchant details and do not invite payments until real order creation and payment verification are in place.
