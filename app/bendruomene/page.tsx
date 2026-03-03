16:28:39.676 Running build in Portland, USA (West) – pdx1
16:28:39.677 Build machine configuration: 2 cores, 8 GB
16:28:39.813 Cloning github.com/edvardassmulaitis/musiclt (Branch: main, Commit: f4469e3)
16:28:40.777 Cloning completed: 964.000ms
16:28:40.914 Restored build cache from previous deployment (Ej7FNWFA1n7A5hVxrgJYWgrrek22)
16:28:42.480 Running "vercel build"
16:28:43.433 Installing dependencies...
16:28:46.805 
16:28:46.806 up to date in 3s
16:28:46.806 
16:28:46.806 94 packages are looking for funding
16:28:46.806   run `npm fund` for details
16:28:46.840 Detected Next.js version: 15.5.12
16:28:46.841 Running "npm run build"
16:28:46.939 
16:28:46.939 > musiclt@1.0.0 build
16:28:46.939 > next build
16:28:46.940 
16:28:47.677    ▲ Next.js 15.5.12
16:28:47.677 
16:28:47.726    Creating an optimized production build ...
16:28:53.687 Failed to compile.
16:28:53.688 
16:28:53.689 ./app/bendruomene/page.tsx
16:28:53.689 Error:   [31mx[0m Expected ';', '}' or <eof>
16:28:53.689    ,-[[36;1;4m/vercel/path0/app/bendruomene/page.tsx[0m:1:1]
16:28:53.689  [2m1[0m | -- Shoutbox messages
16:28:53.690    : [35;1m^^^^^|^^^^^[0m[33;1m ^^^^^^^^[0m
16:28:53.690    :      [35;1m`-- [35;1mThis is the expression part of an expression statement[0m[0m
16:28:53.690  [2m2[0m | CREATE TABLE IF NOT EXISTS shoutbox_messages (
16:28:53.690  [2m3[0m |   id bigserial PRIMARY KEY,
16:28:53.690  [2m4[0m |   user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
16:28:53.690    `----
16:28:53.690 
16:28:53.690 Caused by:
16:28:53.690     Syntax Error
16:28:53.690 
16:28:53.690 Import trace for requested module:
16:28:53.690 ./app/bendruomene/page.tsx
16:28:53.690 
16:28:53.702 
16:28:53.706 > Build failed because of webpack errors
16:28:53.741 Error: Command "npm run build" exited with 1
