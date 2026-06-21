# Clinova - Version 1.2.0

## ملخص الإصدار

هذا هو ملف تسليم الإصدار النهائي الحالي من نظام **Clinova**.

- رقم الإصدار: `1.2.0`
- اسم التطبيق في PM2: `clinova`
- أمر التشغيل: `npm start`
- ملف التشغيل الرئيسي: `server/app.js`
- Health check: `/api/health`
- Version endpoint: `/api/version`
- ملف PM2: `ecosystem.config.cjs`
- قاعدة البيانات الافتراضية: SQLite
- يدعم PostgreSQL عبر متغير `DATABASE_URL`

## الملفات المهمة قبل الرفع

تأكد أن هذه الملفات موجودة في GitHub:

- `server/`
- `client/`
- `deploy/`
- `package.json`
- `package-lock.json`
- `ecosystem.config.cjs`
- `.env.production.example`
- `VERSION`
- `CHANGELOG.md`

لا ترفع هذه الملفات أو المجلدات إلى GitHub:

- `.env`
- `data/`
- `backups/`
- `node_modules/`
- `logs/`

## 1. رفع المشروع إلى GitHub

افتح GitHub وأنشئ Repository جديد باسم مناسب مثل:

```bash
clinova
```

داخل مجلد المشروع على جهازك:

```bash
git status
git remote add origin https://github.com/YOUR_USER/clinova.git
git branch -M main
git push -u origin main
git push origin v1.2.0
```

إذا كان `origin` موجودا مسبقا:

```bash
git remote set-url origin https://github.com/YOUR_USER/clinova.git
git push -u origin main
git push origin v1.2.0
```

مهم جدا: لا تضع كلمات مرور أو مفاتيح API داخل GitHub. ضعها فقط في ملف `.env` على السيرفر.

## 2. اختيار نوع Hostinger المناسب

يوجد خياران:

### الخيار الموصى به: Hostinger VPS

هذا هو الأفضل للنظام الحقيقي لأنه يعطيك:

- تشغيل دائم عبر PM2.
- Nginx reverse proxy.
- PostgreSQL على السيرفر.
- تحكم كامل في النسخ الاحتياطي والاسترجاع.
- تحديثات شبه مستمرة بدون إيقاف طويل باستخدام `pm2 reload`.

### خيار Managed Node.js من Hostinger

مناسب إذا أردت سهولة أكبر من لوحة Hostinger وربط مباشر مع GitHub. لكنه أقل مرونة من VPS في Nginx وPM2 وإعدادات PostgreSQL المتقدمة.

## 3. تجهيز السيرفر على Hostinger VPS

ادخل إلى السيرفر عبر SSH:

```bash
ssh root@SERVER_IP
```

ثبت الحزم الأساسية:

```bash
sudo apt update
sudo apt install -y git nginx postgresql postgresql-contrib
```

ثبت Node.js 22 أو أحدث. بعد التثبيت تحقق:

```bash
node --version
npm --version
```

ثبت PM2:

```bash
npm install pm2@latest -g
pm2 --version
```

## 4. تجهيز PostgreSQL

أنشئ قاعدة ومستخدم:

```bash
sudo -u postgres psql
```

داخل PostgreSQL:

```sql
CREATE DATABASE clinova;
CREATE USER clinova_user WITH ENCRYPTED PASSWORD 'CHANGE_STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE clinova TO clinova_user;
\q
```

قيمة الاتصال ستكون بهذا الشكل:

```bash
DATABASE_URL=postgres://clinova_user:CHANGE_STRONG_PASSWORD_HERE@127.0.0.1:5432/clinova
```

## 5. تنزيل المشروع من GitHub على السيرفر

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/YOUR_USER/clinova.git
cd clinova
npm install --production
```

أنشئ ملف البيئة:

```bash
cp .env.production.example .env
nano .env
```

ضع القيم المناسبة، مثال:

```bash
NODE_ENV=production
PORT=3000
APP_URL=https://your-domain.com
DATABASE_URL=postgres://clinova_user:CHANGE_STRONG_PASSWORD_HERE@127.0.0.1:5432/clinova
SESSION_SECRET=CHANGE_TO_LONG_RANDOM_SECRET
```

ابدأ قاعدة البيانات:

```bash
npm run init-db
```

إذا عندك بيانات SQLite من النسخة المحلية وتريد نقلها إلى PostgreSQL:

```bash
npm run pg:migrate
```

## 6. تشغيل النظام عبر PM2

```bash
npm run pm2:start
pm2 save
pm2 startup
```

بعد أمر `pm2 startup` سيظهر لك أمر إضافي. انسخه وشغله كما هو.

تحقق:

```bash
pm2 status
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/version
```

## 7. إعداد Nginx وربط الدومين

أنشئ ملف Nginx:

```bash
sudo nano /etc/nginx/sites-available/clinova
```

ضع هذا الإعداد مع تغيير الدومين:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

فعّل الموقع:

```bash
sudo ln -s /etc/nginx/sites-available/clinova /etc/nginx/sites-enabled/clinova
sudo nginx -t
sudo systemctl reload nginx
```

## 8. تفعيل SSL

ثبت Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

فعّل شهادة SSL:

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

اختبر التجديد:

```bash
sudo certbot renew --dry-run
```

## 9. ربط الدومين من GoDaddy

إذا الدومين في GoDaddy وتريد إبقاء DNS داخل GoDaddy:

1. ادخل إلى GoDaddy.
2. افتح Domain Portfolio.
3. اختر الدومين.
4. افتح DNS.
5. عدل أو أضف السجلات التالية:

```text
Type: A
Name: @
Value: SERVER_IP
TTL: Default
```

```text
Type: CNAME
Name: www
Value: your-domain.com
TTL: Default
```

إذا أردت إدارة DNS من Hostinger بدلا من GoDaddy:

1. من GoDaddy افتح الدومين.
2. DNS ثم Nameservers.
3. اختر استخدام nameservers مخصصة.
4. ضع nameservers الخاصة بـ Hostinger.

ملاحظة: تغيير DNS قد يعمل خلال ساعة، وقد يحتاج حتى 48 ساعة عالميا.

## 10. تحديث النظام مستقبلا من GitHub بدون إيقاف طويل

على جهازك:

```bash
git add .
git commit -m "describe change"
git push origin main
```

على السيرفر:

```bash
cd /var/www/clinova
git pull origin main
npm install --production
npm run init-db
npm run pm2:reload
curl http://127.0.0.1:3000/api/health
```

إذا كان التحديث إصدارا جديدا:

```bash
git tag v1.2.1
git push origin v1.2.1
```

## 11. النسخ الاحتياطي والاسترجاع

إنشاء نسخة احتياطية:

```bash
npm run backup
```

استرجاع نسخة:

```bash
npm run restore
```

قبل أي تحديث كبير:

```bash
npm run backup
git status
```

## 12. فحص نهائي بعد الرفع

افتح:

```text
https://your-domain.com/api/health
https://your-domain.com/api/version
```

ثم ادخل إلى النظام من:

```text
https://your-domain.com
```

افحص:

- تسجيل الدخول.
- البحث السريع.
- التقويم.
- إضافة موعد.
- ملف العميل.
- التقارير.
- طباعة إيصال.
- رفع شعار العيادة.
- تغيير كلمة المرور.

## مصادر رسمية مفيدة

- Hostinger Node.js Web Apps: https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/
- Hostinger Node.js options: https://www.hostinger.com/support/1583661-is-node-js-supported-at-hostinger/
- Hostinger CloudPanel Node.js VPS: https://support.hostinger.com/en/articles/9553137-how-to-set-up-a-node-js-application-using-hostinger-cloudpanel
- GitHub existing project push: https://docs.github.com/en/github/importing-your-projects-to-github/adding-an-existing-project-to-github-using-the-command-line
- GoDaddy DNS records: https://www.godaddy.com/help/manage-dns-records-680
- GoDaddy nameservers: https://www.godaddy.com/help/edit-my-domain-nameservers-664
