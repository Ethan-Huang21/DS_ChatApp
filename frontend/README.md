## Setting up PocketBase

Setting up an admin account:
```
./pocketbase admin create "junyi.li@ucalgary.ca" "123123123123"
```

Run PocketBase:
```
./pocketbase serve
```

Import collections:
Go to the PocketBase Admin Portal - Settings - Import Collections - Load from JSON file - choose `pb_schema.json` file in the repo

## Getting Started

First, install dependencies:

```bash
npm install
```

To run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.