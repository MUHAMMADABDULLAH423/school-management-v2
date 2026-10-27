# New School Setup Checklist

Har naye school ke liye same steps — pehli dafa ~30-45 min, phir checklist se ~15 min.
Code same rehta hai (GitHub repo `MUHAMMADABDULLAH423/school-management-v2`), sirf har school ka **apna Firebase + apna Vercel project**.

## Faisla (pehle school se pehle tay kar lo)
- Firebase project **kis ke Google account** par banega? Option A: tumhare account par (tum admin raho ge, school ko sirf app logins) — Option B: school ke apne account par (data unki ownership). Recommended: **Option A** — warna kal ko school tum se data wapas maangega.
- Rates: setup fee kitni? Monthly maintenance kitni? Training + data entry included hai ya alag?

## Part A — School ka Firebase project (~10 min)
- [ ] console.firebase.google.com → **Add project** (school ke naam par, analytics off chalega)
- [ ] Build → Authentication → Sign-in method → **Email/Password → Enable**
- [ ] Build → Firestore Database → **Create database** → region `asia-south1` → Start in **production mode**
- [ ] Firestore → **Rules** tab → is repo ki `firestore.rules` file ka poora content paste karo → **Publish**
- [ ] Project settings (gear icon) → **Your apps** → Web app add karo (`</>`) → nickname = school ka naam
- [ ] Wahan se config values copy kar ke rakho: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`

## Part B — Vercel par school ka project (~10 min)
- [ ] vercel.com → **Add New Project** → **same GitHub repo** select karo
- [ ] Environment Variables me **usi school ke Firebase** ki values dalo (Part A wali — apne wale project ki values kabhi mat dalna)
- [ ] **Deploy** → jo link mile (jaise `greenwood-school.vercel.app`) wo school ka link hai — note kar lo
- [ ] Chaho to baad me custom domain laga lo (~3000–4000 PKR/saal), Vercel → Settings → Domains

## Part C — Pehla admin setup (~10 min)
- [ ] School ka link kholo → first-run setup me **School Profile** bharo (naam, address, phone, logo, bank accounts)
- [ ] Firebase Auth me admin ka login banao (Console → Authentication → Add user)
- [ ] Admin portal se: Classes + sections → Teachers & Staff (+ unke logins) → Students (Admissions)
- [ ] Principal ka login ready karo

## Part D — Handover
- [ ] Principal, admin/office staff, teachers, parents — sab ko **apne logins** do (pehli dafa password khud set karwao)
- [ ] 30 min ki training: attendance, fees, marks entry — system simple hai, zyada nahi lagegi
- [ ] **1–2 hafte ka trial** real data par chalwao — fees ka ek month, ek teacher se marks entry; jo khami nikle abhi fix hogi

## Zaroori batein (bhoolna mat)
- ⚠️ **Apna wala Firebase project kabhi kisi school ko mat do** — usme tumhara test data hai. Har school ka data 100% alag.
- Har school ko Firebase ka **free tier alag** milta hai — chhote school ka free me hi chal jayega. Usage barhe to Blaze (pay-as-you-go) tab ki baat hai.
- Code fix aye to: **ek dafa repo me update → har school ke Vercel project par Redeploy** dabao. School ka data touch nahi hota, sirf app update hoti hai.
- Mahine me ek dafa har school ka data export karke rakhna achhi aadat hai (backup).
