# Clinova GitHub CI/CD

## ماذا يفعل المسار التلقائي

عند عمل `push` إلى فرع `main`:

1. GitHub Actions يشغل فحص syntax لملفات السيرفر والواجهة.
2. إذا نجح الفحص، يتصل بالسيرفر عبر SSH.
3. السيرفر يشغل `deploy/update-from-github.sh`.
4. السكربت يعمل backup قبل التحديث.
5. يسحب آخر نسخة من GitHub.
6. يشغل `npm ci --omit=dev`.
7. يشغل `npm run init-db`.
8. يعمل `pm2 startOrReload`.
9. يفحص `/api/health`.

## GitHub Secrets المطلوبة

افتح:

`GitHub Repository > Settings > Secrets and variables > Actions > New repository secret`

أضف:

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

## تجهيز SSH deploy user على السيرفر

على السيرفر:

```bash
sudo adduser deploy
sudo usermod -aG sudo deploy
sudo mkdir -p /home/deploy/.ssh
sudo nano /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

ضع المفتاح العام داخل `authorized_keys`.

## تجهيز مجلد المشروع

```bash
sudo mkdir -p /var/www
sudo chown -R deploy:deploy /var/www
cd /var/www
git clone git@github.com:YOUR_USER/clinova.git clinova
cd clinova
cp .env.production.example .env
nano .env
npm ci --omit=dev
npm run init-db
npm exec pm2 startOrReload ecosystem.config.cjs --update-env
npm exec pm2 save
```

## أول تجربة

من GitHub:

`Actions > CI/CD Deploy Clinova > Run workflow`

أو من جهازك:

```bash
git push origin main
```

## فحص بعد النشر

```bash
pm2 status
curl -fsS http://127.0.0.1:3000/api/health
tail -n 80 logs/pm2-error.log
```

## ملاحظات أمان

- لا تضع `.env` في GitHub.
- لا تضع `WHATSAPP_ACCESS_TOKEN` في الكود.
- لا تضع `DATABASE_URL` في workflow مباشرة.
- اجعل Secrets داخل GitHub فقط.
- استخدم مفتاح SSH خاص بالنشر فقط وليس مفتاحك الشخصي الأساسي.
