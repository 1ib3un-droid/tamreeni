# تمريني

تطبيق ويب شخصي للتمارين والأكل. يشتغل على الآيفون والآيباد كتطبيق من الشاشة الرئيسية، ويشتغل بدون نت.

## الرفع على GitHub Pages (من الآيباد)

1. افتح github.com وسجّل دخول.
2. أنشئ مستودع جديد باسم `tamreeni`، واجعله **Public**.
3. اضغط **Add file ← Upload files**، وارفع كل الملفات اللي داخل المجلد. لا ترفع المجلد نفسه:
   `index.html`, `app.js`, `data.js`, `sw.js`, `manifest.json`, `icon-192.png`, `icon-512.png`
4. اضغط **Commit changes**.
5. ادخل **Settings ← Pages**، واختر:
   - **Branch:** `main`
   - **المجلد:** `/ (root)`
   - اضغط **Save**.
6. بعد دقيقة أو دقيقتين، يصير الرابط شغال:
   `https://1ib3un-droid.github.io/tamreeni/`

## التثبيت على الآيفون

1. افتح الرابط في **Safari**.
2. اضغط زر المشاركة، واختر **إضافة إلى الشاشة الرئيسية**.

## المزامنة بين الآيفون والآيباد (اختياري)

تقدر تستخدم نفس مشروع Firebase حق ميزانيتي.

1. في Firebase Console، ادخل **Authentication ← Sign-in method**، وفعّل **Email/Password**.
2. في **Authentication ← Settings ← Authorized domains**، تأكد إن `1ib3un-droid.github.io` موجود.
3. في **Firestore ← Rules**، أضف هذا داخل `match /databases/{database}/documents { ... }`، **بجانب** قواعد ميزانيتي الحالية:

   ```
   match /users/{uid}/fitapp/{doc} {
     allow read, write: if request.auth != null && request.auth.uid == uid;
   }
   ```

4. في التطبيق، ادخل **الإعدادات ← المزامنة**، والصق `firebaseConfig`، وسوّ حساب بإيميل وكلمة مرور.
5. على الجهاز الثاني، الصق نفس الإعداد وادخل بنفس الحساب.

## التحديثات

لما تعدّل ملف وترفعه من جديد، التطبيق يجيب النسخة الجديدة تلقائياً أول ما تفتحه وأنت متصل بالنت.
