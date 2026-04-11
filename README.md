<p align="center">
  <img src="src/assets/logo.png" alt="شعار تحويل" width="200" />
</p>

<h1 dir="rtl" align="center">تحويل لسطح المكتب (Tahweel Desktop)</h1>

<p dir="rtl" align="center">
  <strong>تطبيق لسطح المكتب يحوّل ملفات PDF والصور إلى نصوص باستخدام OCR من Google Drive</strong>
</p>

<p align="center">
  <a href="https://github.com/ieasybooks/tahweel-tauri/releases/latest"><img src="https://img.shields.io/github/v/release/ieasybooks/tahweel-tauri" alt="أحدث إصدار" /></a>
  <a href="https://github.com/ieasybooks/tahweel-tauri/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="الرخصة" /></a>
  <img src="https://img.shields.io/badge/tauri-v2-24C8DB.svg" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="المنصات المدعومة" />
</p>

<p align="center">
  <a href="#المميزات">المميزات</a> •
  <a href="#كيف-يعمل">كيف يعمل</a> •
  <a href="#الخصوصية-والأمان">الخصوصية والأمان</a> •
  <a href="#التطوير">التطوير</a> •
  <a href="#المشاريع-ذات-الصلة">المشاريع ذات الصلة</a> •
  <a href="#المساهمة">المساهمة</a>
</p>

<p align="center">
  <a href="README.en.md">🌐 English</a>
</p>

---

<p dir="rtl"><strong>تحويل لسطح المكتب</strong> هو نسخة سطح المكتب من مشروع تحويل. يتيح لك تحويل ملفات PDF والصور إلى نصوص قابلة للتحرير بالاعتماد على OCR في Google Drive. بُني باستخدام Tauri 2 وVue 3 وRust، ويستخدم محرك OCR نفسه وجودة الإخراج نفسها الموجودة في <a href="https://github.com/ieasybooks/tahweel.rb">مكتبة Ruby</a> و<a href="https://github.com/ieasybooks/tahweel">النسخة الأصلية المكتوبة بلغة Python</a>، مع واجهة تدعم السحب والإفلات، والعمل بالعربية والإنجليزية، وتتبع التقدم لحظة بلحظة.</p>

<h2 dir="rtl" id="المميزات">المميزات</h2>

<ul dir="rtl">
  <li>🔤 <strong>استخراج نصوص بدقة عالية</strong> — يعتمد على محرك Google Drive OCR، ويعطي نتائج جيدة خصوصاً مع النصوص العربية</li>
  <li>📄 <strong>صيغ إدخال متعددة</strong> — يدعم ملفات PDF و JPG و JPEG و PNG</li>
  <li>📝 <strong>صيغ إخراج متعددة</strong> — تصدير إلى TXT أو DOCX أو JSON، مع دعم اتجاه النص من اليمين إلى اليسار في ملفات DOCX</li>
  <li>🌐 <strong>دعم العربية</strong> — يكتشف اتجاه النص تلقائياً ويحسن الإخراج العربي</li>
  <li>⚡ <strong>معالجة متوازية للصفحات</strong> — يمكنك ضبط عدد عمليات OCR المتزامنة من 1 إلى 20 لكل ملف</li>
  <li>📊 <strong>تتبع تقدّم واضح</strong> — يعرض تقدّم المعالجة على مستوى المهمة كاملة وعلى مستوى كل ملف، مع إمكانية الإلغاء</li>
  <li>🖥️ <strong>عبر المنصات</strong> — يعمل على macOS و Linux و Windows كتطبيق سطح مكتب أصلي</li>
  <li>🌍 <strong>واجهة بالعربية والإنجليزية</strong> — يمكن التبديل بين اللغتين أثناء التشغيل</li>
  <li>🗂️ <strong>معالجة دفعات</strong> — يمكنك تحويل مجلد كامل من الملفات المدعومة دفعة واحدة</li>
  <li>🖱️ <strong>السحب والإفلات</strong> — اسحب الملفات أو المجلدات إلى نافذة التطبيق لبدء المعالجة</li>
  <li>🔒 <strong>تسجيل دخول OAuth محمي</strong> — يستخدم PKCE (RFC 7636) والتحقق من <code dir="ltr">state</code> لحماية عملية تسجيل الدخول</li>
  <li>📂 <strong>فتح مجلد الإخراج تلقائياً</strong> — يفتح التطبيق مجلد الإخراج عند انتهاء التحويل</li>
</ul>

<h2 dir="rtl" id="كيف-يعمل">كيف يعمل</h2>

<ol dir="rtl">
  <li><strong>تحويل PDF إلى صور</strong> — يحوّل التطبيق ملفات PDF إلى صور PNG محلياً باستخدام PDFium، صورة واحدة لكل صفحة. ملف PDF الأصلي لا يغادر جهازك.</li>
  <li><strong>OCR عبر Google Drive</strong> — يرفع كل صفحة إلى Google Drive الخاص بك على شكل مستند Google Doc مؤقت، وهذا ما يفعّل OCR المدمج في Google Drive. بعد ذلك يعيد النص المستخرج إلى جهازك عبر HTTPS.</li>
  <li><strong>حذف الملفات المؤقتة</strong> — يحاول التطبيق حذف مستندات Google Docs المؤقتة فور الانتهاء من الاستخراج.</li>
  <li><strong>إخراج الملفات</strong> — يكتب النص المستخرج بالصيغ التي اخترتها داخل مجلد الإخراج.</li>
</ol>

<h2 dir="rtl">المتطلبات</h2>

<h3 dir="rtl">Node.js</h3>

<p dir="rtl">يتطلب <strong>Node.js 18</strong> أو أحدث.</p>

<h3 dir="rtl">Rust</h3>

<p dir="rtl">يتطلب <strong>Rust 1.70</strong> أو أحدث. يمكنك تثبيته عبر <a href="https://rustup.rs/">rustup</a>.</p>

<h3 dir="rtl">مكتبة PDFium</h3>

<p dir="rtl">يستخدم تطبيق تحويل مكتبة <a href="https://pdfium.googlesource.com/pdfium/">PDFium</a> لعرض ملفات PDF. يجب وضع المكتبة في <code dir="ltr">src-tauri/resources/</code> باسم أحد الملفات التالية:</p>

<ul dir="rtl">
  <li><code dir="ltr">libpdfium.dylib</code> (macOS)</li>
  <li><code dir="ltr">libpdfium.so</code> (Linux)</li>
  <li><code dir="ltr">pdfium.dll</code> (Windows)</li>
</ul>

<p dir="rtl">يوجد سكربت مساعد لتنزيل النسخ الجاهزة من PDFium:</p>

```bash
./scripts/download-pdfium.sh
```

<h3 dir="rtl">حساب Google</h3>

<p dir="rtl">ستحتاج إلى حساب Google لاستخدام خدمة OCR في Google Drive. عند أول تسجيل دخول، ستُفتح نافذة في المتصفح لإكمال المصادقة عبر OAuth.</p>

<h3 dir="rtl">mise (اختياري)</h3>

<p dir="rtl">إذا كنت تستخدم <a href="https://mise.jdx.dev/">mise</a> لإدارة إصدارات الأدوات، فشغّل <code dir="ltr">mise install</code> لتثبيت إصدارات Node.js وRust المحددة في <code dir="ltr">mise.toml</code>.</p>

<h2 dir="rtl">التثبيت</h2>

<h3 dir="rtl">من الإصدارات الرسمية</h3>

<p dir="rtl">نزّل أحدث نسخة مناسبة لنظامك من <a href="https://github.com/ieasybooks/tahweel-tauri/releases/latest">صفحة الإصدارات</a>:</p>

<ul dir="rtl">
  <li><strong>macOS</strong> — ملف <code dir="ltr">.dmg</code> (لمعالجات Apple Silicon و Intel)</li>
  <li><strong>Linux</strong> — ملف <code dir="ltr">.AppImage</code> أو <code dir="ltr">.deb</code></li>
  <li><strong>Windows</strong> — مثبِّت <code dir="ltr">.msi</code></li>
</ul>

<h3 dir="rtl">من المصدر</h3>

```bash
git clone https://github.com/ieasybooks/tahweel-tauri.git
cd tahweel-tauri
npm install
./scripts/download-pdfium.sh
npm run tauri build
```

<p dir="rtl">سيكون التطبيق المبني في <code dir="ltr">src-tauri/target/release/bundle/</code>.</p>

<h2 dir="rtl" id="التطوير">التطوير</h2>

```bash
npm install           # تثبيت اعتماديات الواجهة الأمامية
npm run tauri dev     # التشغيل في وضع التطوير (إعادة تحميل سريع)
npm run tauri build   # البناء للإنتاج
```

<h3 dir="rtl">جودة الشفرة</h3>

```bash
npm run lint:check    # فحص الكود (قراءة فقط)
npm run format:check  # فحص التنسيق (قراءة فقط)
npm run build         # فحص أنواع TypeScript + بناء Vite
```

<h2 dir="rtl">الاختبارات</h2>

```bash
npm run test          # تشغيل اختبارات الواجهة الأمامية (Vitest)
npm run test:watch    # تشغيل الاختبارات في وضع المراقبة
npm run test:coverage # تشغيل الاختبارات مع تقرير التغطية

cd src-tauri
cargo test            # تشغيل اختبارات Rust
```

<h2 dir="rtl" id="الخصوصية-والأمان">الخصوصية والأمان</h2>

<p dir="rtl">يتعامل تطبيق تحويل مع مستنداتك ويرفعها إلى خدمة طرف ثالث من أجل OCR. قبل استخدامه، من المهم أن تعرف بوضوح ماذا يحدث لملفاتك وكيف تُحفَظ بيانات الدخول.</p>

<h3 dir="rtl">ما يحدث لملفاتك</h3>

<ul dir="rtl">
  <li><strong>تُعالَج الملفات محلياً أولاً.</strong> يحوّل التطبيق ملفات PDF إلى صور PNG محلياً باستخدام PDFium. ملف PDF الأصلي لا يغادر جهازك أبداً.</li>
  <li><strong>OCR عبر مستندات Google Docs مؤقتة.</strong> يرفع التطبيق كل صفحة إلى Google Drive <strong>الخاص بك</strong> على شكل مستند Google Doc مؤقت باسم عشوائي (UUID). هذا الرفع هو الذي يفعّل OCR في Google Drive. بعد ذلك يعيد النص المستخرج إلى جهازك عبر HTTPS.</li>
  <li><strong>يحاول التطبيق حذف الملف المؤقت فور الانتهاء.</strong> إذا فشل الحذف بسبب خطأ في الشبكة أو بسبب الإلغاء أو تعطل التطبيق، يبقى الملف في Google Drive وعليك حذفه يدوياً. الملفات المتبقية تحمل أسماء UUID وتوجد في جذر Drive، لذلك يسهل العثور عليها.</li>
  <li><strong>لا توجد أي تحليلات أو تتبع.</strong> لا يرسل التطبيق بيانات استخدام أو تقارير أعطال. حركة الشبكة الوحيدة تكون إلى خدمات OAuth وGoogle Drive أثناء تسجيل الدخول وتشغيل OCR.</li>
</ul>

<h3 dir="rtl">صلاحيات Google Drive التي يطلبها التطبيق</h3>

<p dir="rtl">يطلب تطبيق تحويل <strong>فقط</strong> النطاق <code dir="ltr">https://www.googleapis.com/auth/drive.file</code>. ووفقاً لتوثيق Google، فهذا النطاق يمنح التطبيق وصولاً <strong>فقط إلى الملفات التي ينشئها بنفسه</strong>. وهذا يعني أنه لا يستطيع قراءة ملفاتك الموجودة مسبقاً في Google Drive ولا تعديلها ولا عرضها.</p>

<h3 dir="rtl">كيف تم تحصين تسجيل الدخول</h3>

<p dir="rtl">يستخدم التطبيق وسيلتين أساسيتين لحماية تسجيل الدخول:</p>

<ul dir="rtl">
  <li><strong>PKCE</strong> (Proof Key for Code Exchange، <a href="https://datatracker.ietf.org/doc/html/rfc7636">RFC 7636</a>) — في كل عملية تسجيل دخول، يولد التطبيق قيمة <code dir="ltr">code_verifier</code> عشوائية جديدة، ويرسل إلى Google تجزئتها فقط على شكل <code dir="ltr">code_challenge</code>. ثم يرسل القيمة الأصلية لاحقاً عند استبدال رمز التفويض برموز الوصول. هذا يمنع اعتراض رمز التفويض أو إعادة استخدامه.</li>
  <li><strong>التحقق من <code dir="ltr">state</code></strong> — في كل عملية تسجيل دخول، يولد التطبيق قيمة <code dir="ltr">state</code> عشوائية جديدة ويتحقق من تطابقها عند وصول رد الاتصال. أي رد اتصال بقيمة <code dir="ltr">state</code> مفقودة أو غير متطابقة يُرفَض، بينما يظل المستمع بانتظار الرد الشرعي.</li>
</ul>

<p dir="rtl">قيمة <code dir="ltr">client_secret</code> المضمّنة في التطبيق <strong>ليست سراً حقيقياً</strong>. هذا أمر معتاد في تطبيقات سطح المكتب، وهو موثّق من Google نفسها. الحماية الفعلية تأتي من PKCE، أما هذه القيمة فهي مجرد معرّف لعميل OAuth.</p>

<h3 dir="rtl">أين تُخزَّن الرموز المميزة</h3>

<p dir="rtl">بعد تسجيل الدخول، يُخزّن التطبيق رمز الوصول ورمز التحديث في ملف JSON نصي داخل مجلد ذاكرة التخزين المؤقت الخاص بنظامك:</p>

<div dir="rtl">

| نظام التشغيل | المسار |
|---|---|
| macOS | `~/Library/Caches/tahweel/token.json` |
| Linux | `~/.cache/tahweel/token.json` |
| Windows | `%LOCALAPPDATA%\tahweel\token.json` |

</div>

<p dir="rtl">يحتوي هذا الملف على رمز التحديث الخاص بك، وهو ما يسمح للتطبيق بمتابعة الوصول إلى الملفات التي أنشأها ضمن نطاق <code dir="ltr">drive.file</code> من دون أن يطلب منك تسجيل الدخول كل مرة. عند تسجيل الخروج يُحذَف هذا الملف. وقد تنتقل الإصدارات القادمة إلى مخزن كلمات المرور الأصلي في النظام، مثل Keychain في macOS وCredential Manager في Windows وSecret Service في Linux.</p>

<h3 dir="rtl">ماذا يفعل "تسجيل الخروج"</h3>

<p dir="rtl">عند النقر على "تسجيل الخروج"، يمسح التطبيق الرموز من الذاكرة ويحذف ملف <code dir="ltr">token.json</code> المحلي. لكنه لا يُبطِل هذه الرموز من جهة Google نفسها. إذا أردت إلغاء وصول تحويل نهائياً إلى حسابك، فزر <a href="https://myaccount.google.com/permissions">حساب Google ← الأمان ← التطبيقات الخارجية التي لها وصول إلى حسابك</a>.</p>

<h2 dir="rtl">هيكل المشروع</h2>

```
src/                      # واجهة Vue 3 الأمامية
├── components/           # مكونات الواجهة
├── composables/          # دوال منطق التطبيق
├── stores/               # إدارة الحالة بـ Pinia
├── i18n/                 # الترجمات (ar/en)
└── assets/               # الأصول الثابتة

src-tauri/src/            # الواجهة الخلفية بـ Rust
├── lib.rs                # تسجيل أوامر Tauri
├── auth.rs               # تدفق OAuth2 من Google (PKCE + state)
├── pdf.rs                # عرض PDF باستخدام PDFium
└── google_drive.rs       # عمليات Google Drive API

scripts/                  # سكربتات مساعدة للبناء
```

<h2 dir="rtl">التقنيات المستخدمة</h2>

<p dir="rtl"><strong>الواجهة الأمامية:</strong> Vue 3، TypeScript، Pinia، Tailwind CSS، vue-i18n، docx</p>

<p dir="rtl"><strong>الواجهة الخلفية:</strong> Tauri 2.0، Rust، pdfium-render، Rayon، Tokio، Reqwest</p>

<h2 dir="rtl" id="المشاريع-ذات-الصلة">المشاريع ذات الصلة</h2>

<ul dir="rtl">
  <li>🐍 <a href="https://github.com/ieasybooks/tahweel">ieasybooks/tahweel</a> — النسخة الأصلية المكتوبة بلغة Python</li>
  <li>💎 <a href="https://github.com/ieasybooks/tahweel.rb">ieasybooks/tahweel.rb</a> — مكتبة Ruby وواجهة سطر الأوامر</li>
  <li>🌐 <a href="https://github.com/ieasybooks/tahweel-website">ieasybooks/tahweel-website</a> — الموقع الرسمي</li>
</ul>

<h2 dir="rtl" id="المساهمة">المساهمة</h2>

<p dir="rtl">نرحب بتقارير الأخطاء وطلبات السحب على GitHub: https://github.com/ieasybooks/tahweel-tauri.</p>

<ol dir="rtl">
  <li>أنشئ نسخة من المستودع (Fork)</li>
  <li>أنشئ فرع الميزة (<code dir="ltr">git checkout -b feature/amazing-feature</code>)</li>
  <li>ثبّت تغييراتك (<code dir="ltr">git commit -am 'Add amazing feature'</code>)</li>
  <li>ادفع إلى الفرع (<code dir="ltr">git push origin feature/amazing-feature</code>)</li>
  <li>افتح طلب سحب (Pull Request)</li>
</ol>

<p dir="rtl">قبل الإرسال، تأكد من أن:</p>

```bash
npm run test          # اختبارات الواجهة الأمامية تنجح
cd src-tauri && cargo test  # اختبارات Rust تنجح
npm run lint:check    # لا توجد تحذيرات
npm run format:check  # الكود منسَّق
```

<h2 dir="rtl">الرخصة</h2>

<p dir="rtl">هذا التطبيق متاح كمصدر مفتوح بموجب شروط <a href="https://opensource.org/licenses/MIT">رخصة MIT</a>.</p>

---

<p dir="rtl" align="center">صُنع بـ ❤️ بواسطة <a href="https://github.com/ieasybooks">iEasyBooks</a></p>
