# Clinova - Release 1.3.0

## ملف رفع الإصدار إلى GitHub وتحديث السيرفر

هذا الملف خاص بنهاية إصدار `1.3.0` من نظام **Clinova**.

آخر كود محفوظ في Git:

```text
954be73 fix: localize appointment conflict errors
```

## 1. رفع الإصدار إلى GitHub من جهازك

افتح PowerShell داخل مجلد المشروع:

```powershell
cd "C:\Users\mkhla\Desktop\switch solutions\clinova\clinova"
git status
```

إذا لم يكن GitHub remote مضافا:

```powershell
git remote add origin https://github.com/YOUR_USER/clinova.git
```

إذا كان remote موجودا وتريد تغييره:

```powershell
git remote set-url origin https://github.com/YOUR_USER/clinova.git
```

ارفع الفرع الرئيسي:

```powershell
git branch -M main
git push -u origin main
```

أنشئ tag للإصدار:

```powershell
git tag v1.3.0
git push origin v1.3.0
```

## 2. إعداد GitHub Secrets للـ CI/CD

داخل GitHub افتح:

```text
Repository > Settings > Secrets and variables > Actions > New repository secret
```

أضف هذه القيم:

```text
SSH_HOST=SERVER_IP_OR_DOMAIN
SSH_USER=deploy
SSH_PRIVATE_KEY=PRIVATE_SSH_KEY_CONTENT
```

اختياري:

```text
SSH_PORT=22
APP_DIR=/var/www/clinova
HEALTH_URL=http://127.0.0.1:3000/api/health
```

## 3. تحديث النظام تلقائيا على السيرفر

بعد ضبط Secrets، أي أمر:

```powershell
git push origin main
```

سيشغل GitHub Actions تلقائيا:

- فحص ملفات JavaScript.
- الاتصال بالسيرفر عبر SSH.
- عمل backup قبل التحديث.
- سحب آخر نسخة من `origin/main`.
- تثبيت الاعتمادات.
- تهيئة قاعدة البيانات.
- إعادة تحميل PM2.
- فحص `/api/health`.

## 4. تحديث النظام يدويا من السيرفر

إذا أردت التحديث من السيرفر مباشرة:

```bash
cd /var/www/clinova
BRANCH=main bash deploy/update-from-github.sh
```

السكربت سيقوم بـ:

```text
backup
git fetch
git reset --hard origin/main
npm ci --omit=dev
npm run init-db
pm2 startOrReload
pm2 save
health check
```

## 5. فحص النظام بعد التحديث

على السيرفر:

```bash
pm2 status
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/version
```

إذا الدومين مربوط:

```bash
curl -fsS https://YOUR_DOMAIN.com/api/health
```

## 6. ملاحظات مهمة

- السيرفر يسحب آخر commit من `main`.
- الـ tag مثل `v1.3.0` يستخدم لتعليم الإصدار والرجوع له عند الحاجة.
- لا ترفع `.env` إلى GitHub.
- لا تضع `DATABASE_URL` أو `WHATSAPP_ACCESS_TOKEN` داخل الكود.
- النسخ الاحتياطي يعمل قبل كل تحديث عبر `deploy/update-from-github.sh`.

## 7. أوامر مفيدة

عرض آخر commits:

```bash
git log --oneline -5
```

عرض حالة PM2:

```bash
pm2 status
```

عرض سجلات التطبيق:

```bash
pm2 logs clinova
```

عرض سجلات النسخ الاحتياطي:

```bash
pm2 logs clinova-backup
```

تشغيل backup يدوي:

```bash
npm run backup
```

استرجاع backup:

```bash
npm run restore -- backups/FILE_NAME.sqlite
```
