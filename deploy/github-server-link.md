# ربط Clinova مع GitHub والتحديث المستمر

هذا المسار يجعل السيرفر يسحب التحديثات من GitHub ثم يعمل `pm2 reload` بدون الحاجة لإيقاف النظام يدوياً.

## 1. تجهيز GitHub من جهاز التطوير

داخل مجلد المشروع:

```bash
git init
git add .
git commit -m "release: clinova 1.2.0"
git branch -M main
git remote add origin git@github.com:YOUR_USER/clinova.git
git tag v1.2.0
git push -u origin main --tags
```

استبدل `YOUR_USER/clinova` باسم المستودع الحقيقي.

## 2. تجهيز SSH بين السيرفر و GitHub

على السيرفر:

```bash
ssh-keygen -t ed25519 -C "clinova-server"
cat ~/.ssh/id_ed25519.pub
```

انسخ المفتاح العام إلى GitHub:

`Repository > Settings > Deploy keys > Add deploy key`

اختر `Read-only` إذا كان السيرفر سيقرأ فقط.

## 3. أول تثبيت على السيرفر

```bash
export REPO_URL=git@github.com:YOUR_USER/clinova.git
export APP_DIR=/var/www/clinova
export BRANCH=main
bash deploy/server-first-install.sh
```

بعدها عدل `.env` وضع:

```bash
SESSION_SECRET=CHANGE_TO_LONG_RANDOM_SECRET
COOKIE_SECURE=true
```

ثم:

```bash
npm exec pm2 reload ecosystem.config.cjs --update-env
npm exec pm2 save
```

## 4. تحديث النظام بعد كل إصدار

على السيرفر:

```bash
cd /var/www/clinova
bash deploy/update-from-github.sh
```

السكربت يقوم بـ:

- أخذ backup قبل التحديث.
- `git pull --ff-only`.
- تثبيت الاعتمادات بـ `npm ci --omit=dev`.
- تشغيل `npm run init-db` لأي migrations.
- إعادة تحميل PM2 بـ `pm2 reload`.
- فحص `/api/health`.

## 5. تحديث آلي بدون دخول يدوي

أبسط خيار آمن هو cron كل 5 دقائق:

```bash
crontab -e
```

أضف:

```cron
*/5 * * * * cd /var/www/clinova && BRANCH=main bash deploy/update-from-github.sh >> logs/deploy.log 2>&1
```

إذا لا تريد أن يسحب السيرفر كل 5 دقائق، استخدم GitHub Actions أو webhook لاحقاً.

## ملاحظات مهمة

- لا ترفع `.env` أو مجلد `data/` إلى GitHub.
- لا ترفع `node_modules/`.
- قاعدة البيانات تبقى على السيرفر، والتحديث يغيّر الكود فقط.
- في الإنتاج مع مستخدمين كثيرين، الأفضل الانتقال الكامل إلى PostgreSQL.
