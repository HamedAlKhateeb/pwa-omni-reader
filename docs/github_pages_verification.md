# تحقق GitHub Pages ومشاركة الرابط

تم التحقق من الموقع المنشور على:

`https://hamedalkhateeb.github.io/pwa-omni-reader/`

تظهر واجهة «مسار» وتعمل شاشة المكتبة على GitHub Pages. كما تم اختبار المسار التالي:

`/?share=1&share_url=https%3A%2F%2Fwww.rfc-editor.org%2Frfc%2Frfc2606.html&share_title=Shared%20Article`

فتح المسار نافذة حفظ المقال تلقائيًا مع تعبئة رابط المقال والعنوان. يعتمد هذا على `share_target` داخل manifest، ويظهر ضمن قائمة مشاركة النظام في المتصفحات والمنصات التي تدعم استقبال مشاركة PWAs المثبتة.

## التوافق

تعمل المشاركة كوجهة للتطبيق بعد تثبيت الـPWA في Chrome على Android. يعتمد النظام على أن Android قد يضع الرابط في حقل `text` بدل `url`، ولذلك يفحص التطبيق الحقلين. دعم Web Share Target محدود خارج منصات Chromium؛ خصوصًا على iPhone لا ينبغي الاعتماد على ظهور «مسار» ضمن قائمة المشاركة، ويظل فتح الموقع ثم لصق الرابط البديل المتاح.

المراجع: [Chrome for Developers](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target) و[MDN share_target](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target).

## اختبار الربط العام

نجح فتح نسخة GitHub Pages بمسار مشاركة وتعبئة الرابط والعنوان. عند تنفيذ «استخراج وحفظ» أظهر المتصفح `Failed to fetch`. السبب المتوقع هو أن نسخة الاستضافة المدمجة الحالية ما زالت تسبق commit الذي يضيف `/api/extract` مع CORS؛ يلزم حفظ ونشر النسخة المدمجة الجديدة ثم إعادة الاختبار من GitHub Pages.
