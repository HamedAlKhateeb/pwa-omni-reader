# مراجع Supabase Edge Function

## قرارات التنفيذ

تعمل Edge Functions في بيئة Deno وتدعم TypeScript وطلبات HTTP القصيرة. استخدمت ملف `deno.json` مستقلًا لكل دالة لاستيراد الحزم، ومعالجة طلبات `OPTIONS` ورؤوس CORS من الواجهة الثابتة، والنشر عبر Supabase CLI أو GitHub Actions.

تعتمد الواجهة على مفتاح publishable/anon فقط، بينما تبقى أي أسرار مستقبلية داخل إعدادات Supabase أو GitHub Actions ولا تدخل إلى الشفرة أو المتصفح.

## المراجع الرسمية

1. [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
2. [Importing dependencies in Edge Functions](https://supabase.com/docs/guides/functions/dependencies)
3. [CORS support for browser-invoked functions](https://supabase.com/docs/guides/functions/cors)
4. [Deploy Edge Functions](https://supabase.com/docs/guides/functions/deploy)
