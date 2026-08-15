# تحقق GitHub Pages ومشاركة الرابط

تتوفر نسخة «مسار» المنشورة على: <https://hamedalkhateeb.github.io/pwa-omni-reader/>. تم التحقق من استخراج مقال خارجي وحفظه، ومن فتح نافذة الحفظ تلقائيًا من المسار التالي:

```text
/?share=1&share_url=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FReadability&share_title=Readability
```

## الظهور في قائمة المشاركة على Android

يظهر «مسار» في قائمة مشاركة Android فقط بعد تثبيت الموقع كتطبيق PWA من Chrome أو متصفح Chromium مدعوم. بعد النشر الجديد، افتح الموقع، ثم من قائمة المتصفح اختر **تثبيت التطبيق**. إن كان التطبيق مثبتًا قبل هذا الإصدار ولا يظهر ضمن قائمة المشاركة، أزله من الجهاز ثم ثبّته من جديد بعد تحديث الصفحة؛ يعيد ذلك قراءة `share_target` الجديد من manifest.

> يتطلب Web Share Target أن يكون التطبيق مثبّتًا بالفعل، ولا يتوفر في كل المتصفحات أو على iPhone بالمستوى نفسه. [1]

تقرأ «مسار» بيانات المشاركة من `share_url` و`share_title` أو من `share_text`، ثم تعرض نافذة الحفظ. على iPhone أو المتصفحات التي لا تسجل PWA كهدف مشاركة، افتح «مسار» والصق الرابط يدويًا كبديل.

## إعادة تعيين كلمة المرور

زر **«نسيت كلمة المرور»** يرسل رابطًا يعود إلى صفحة تغيير كلمة المرور داخل «مسار» عبر `?reset-password=1`. في لوحة Supabase أضف الرابط التالي إلى **Authentication → URL Configuration → Redirect URLs**؛ لا تحتاج إنشاء صفحة في مدونتك:

| حقل Supabase | القيمة النهائية |
|---|---|
| **Site URL** | `https://hamedalkhateeb.github.io/pwa-omni-reader/` |
| **Redirect URLs** | أضف الرابط المحدد أدناه إلى القائمة المسموح بها. |

```text
https://hamedalkhateeb.github.io/pwa-omni-reader/?reset-password=1
```

عند وصول رسالة Supabase وفتح الرابط، يعرض التطبيق حقلي كلمة المرور الجديدة وتأكيدها، ثم يرسل التغيير للحساب المؤقت المصادق عليه برابط الاستعادة. توصي Supabase بتوجيه رسالة الاستعادة إلى صفحة تغيير كلمة مرور مصرح بها ثم تحديث كلمة مرور المستخدم من تلك الصفحة.[2]

يتعامل التطبيق كذلك مع رابط Supabase عندما تصل رموز الاسترداد في الجزء الذي يبدأ بـ`#`، حتى إذا فُتح الرابط في نافذة PWA تعمل مسبقًا. يراقب التطبيق تغير الرابط ويحوّل الواجهة فورًا إلى نموذج التعيين بدلاً من ترك المستخدم في المكتبة أو صفحة فارغة.

## المراجع

[1]: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target "MDN: share_target"
[2]: https://supabase.com/docs/guides/auth/passwords "Supabase: Password-based Auth"
