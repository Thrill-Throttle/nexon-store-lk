# NEXON STORE LK

A responsive, blue-themed, general-products storefront for home, fashion, electronics, accessories and everyday finds. The website runs without a build step and uses the supplied store logo and LankaQR image.

## Run the website locally

1. Open this folder in Visual Studio Code.
2. Install and start the **Live Server** VS Code extension, then open `index.html` with Live Server. Use `http://127.0.0.1:5500` rather than opening the HTML as a `file://` URL; Google OAuth requires a registered HTTP website address.
3. Browsing, sample product filters and the preview shopping cart work before connecting Supabase.

Product artwork is included locally as SVG. Fonts and the Supabase JavaScript library are loaded from public CDNs, so online access is required for Google login and the selected fonts.

## Free GitHub repository and GitHub Pages hosting

The checked-in [GitHub Pages Actions workflow](./.github/workflows/deploy-pages.yml) publishes the storefront only when you manually run it. Pushing changes to `main` does not update the live website. This lets you review and test changes locally before choosing to publish. The workflow publishes only the website HTML, JavaScript, styles, configuration and required images; it does not publish the database migration or this setup guide.

1. Create a **public** GitHub repository named `nexon-store-lk`. A public repository and website are required for GitHub Pages on the Free plan. This makes the source and store logo and payment QR publicly accessible. The checkout is only a prototype: no customer orders or payments are processed.
2. On your computer, install [Git for Windows](https://git-scm.com/download/win) and sign in to GitHub through VS Code's **Accounts** menu.
3. In VS Code, open the **Source Control** view, choose **Initialize Repository**, stage the website files, create the first commit, choose **Publish to GitHub**, and select the public `nexon-store-lk` repository. The local `.gitignore` excludes common secret and local-development files.
4. In the GitHub repository, open **Settings → Pages** and select **GitHub Actions** as the deployment source.
5. Before publishing a website update, run it locally with Live Server and check the changes in your browser. When you're ready to publish, open **Actions → Deploy storefront to GitHub Pages → Run workflow**, select `main`, and confirm **Run workflow**. The live website changes only after that workflow completes. View the published address under **Settings → Pages** or the finished deployment in **Actions**.
6. Update the Supabase **Authentication → URL Configuration** Site URL to your published Pages address (typically `https://YOUR_GITHUB_USERNAME.github.io/nexon-store-lk/`) and add that address to the allowed redirect URLs. The OAuth callback return path preserves the GitHub Pages repository subpath.

**Before creating the public repository, confirm that you want the supplied payment QR published on a public website.** A QR image is not a password; however, anyone can view or scan a publicly hosted merchant payment QR.

## Secure Google admin setup

The admin panel uses Supabase Auth with Google's OAuth provider. **The administrator role is granted by a trusted Postgres migration, never from the browser or an email input.** The database migration grants access only to the verified Google account `akileshan2023@gmail.com`. The browser displays the signed-in email only after the database has verified its admin role; supplying that email or changing browser data cannot grant access.

1. The existing Supabase project URL and its **publishable** key are already configured in `supabase-config.js`. These values are intentionally browser-visible. **Never put a Supabase `service_role` or secret key in this file, a web page, or a public repository.** If you rotate the publishable key, update that file with the replacement.

2. In Google Cloud Console, configure an OAuth client for a web application. Add the Live Server origin (typically `http://127.0.0.1:5500`) to its authorized JavaScript origins. Add the Supabase callback URL shown in the Supabase Google-provider settings to its authorized redirect URIs. If Google's OAuth consent screen is in testing mode, add `akileshan2023@gmail.com` as a test user.

3. In Supabase **Authentication → Providers → Google**, enable Google and enter the Google OAuth client ID and client secret. Keep the client secret only in the Supabase provider settings. Under **Authentication → URL Configuration**, set the local Site URL and add `http://127.0.0.1:5500/**` to the allowed redirect URLs. Add the production website origin before deployment. If Live Server uses a different port, use its actual origin instead.

4. In Supabase **SQL Editor**, run [`supabase/migrations/202610250001_secure_store_admin.sql`](./supabase/migrations/202610250001_secure_store_admin.sql), then [`supabase/migrations/202610250002_publish_store_catalog_drafts.sql`](./supabase/migrations/202610250002_publish_store_catalog_drafts.sql), in that order. The first migration creates the product and category tables, seeds the sample storefront products, applies Row Level Security, keeps administrator roles in a non-public schema, and adds a trusted database trigger to grant the role to the designated verified Google account. If that Google account already exists, it grants the role only if Supabase has already recorded its verified Google identity. The second migration adds the administrator-only, atomic catalog publishing function.

5. Run the website with Live Server or your published Pages URL. Open `#admin` (or select Store admin after signing in), and choose **Continue with Google**. Sign in with the designated Google account. After authorization, the account opens a profile page with the signed-in Google details, cart shortcut, sign-out control, and a link to the store dashboard. The header account button changes to **My profile** and reopens the profile page. Other accounts are denied. The admin navigation is shown only after the database role check succeeds. Customer accounts are not implemented; Google sign-in is currently reserved for store administration.

6. Test category management by adding a category and a product; confirm that they are visible from the public storefront in another browser. Do not create customer orders or request transfers until production checkout and payment verification have been implemented.

## Category and product management

After Supabase and Google OAuth are configured, sign in through **Store admin**. Add categories, assign new products to a category, edit product details and stock, and update category names. These edits are saved as a private draft in the current browser and previewed there; they do not change the shared catalog. When the preview is ready, choose **Publish updates** and confirm. Publishing updates the live catalog atomically. Drafts are not shared between browsers or devices. **Discard draft** removes unpublished changes from this browser.

Public visitors can read the catalog only. Database policies and administrator-only RPCs protect every category and product change; hiding the admin link is an additional interface detail, **not** the authorization boundary. Publishing verifies that the live catalog has not changed since the draft was started, and refuses to overwrite newer changes. The migration does not give browser clients permission to assign administrator roles.

### Using a Google Drive product photo

The product form accepts an image URL; it does not upload files to Drive or find files by name. To use a Drive photo, upload it to Drive, open **Share → General access**, choose **Anyone with the link → Viewer**, and copy its link. From a link shaped like `https://drive.google.com/file/d/FILE_ID/view?usp=sharing`, copy `FILE_ID` and use `https://drive.google.com/uc?export=view&id=FILE_ID` in the product's **Image URL** field. Open that URL in a private/incognito browser first to confirm it displays without signing in, then save the product as a draft and preview it. The photo must be publicly viewable for shop visitors; do not use this method for private photos. Drive may limit hotlinking or bandwidth, so a public image host or website-hosted image is more reliable for production.

## Remaining launch setup

This project still provides a storefront prototype, **not a complete order-processing system**. Checkout and payment instructions explicitly say no real order is placed. Customer authentication, saved carts, server-validated checkout, stock reservation, customer accounts, receipt storage, shipping rates, order management, and manual payment verification need to be built before taking orders or transfers. The configured QR may accept real money; verify the merchant details and do not invite payments until real order creation and payment verification are in place.
