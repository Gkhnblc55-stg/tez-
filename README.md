# Nöbetçi: Drone Rota ve İrtifa Planlayıcı

Bir veya birden fazla arsayı drone filosuyla sürekli izlemek için rota, irtifa ve drone seçimi planlayan tarayıcı uygulaması.
Yakıt ve enerji tasarrufu ile zaman tasarrufu arasındaki dengeyi siz seçersiniz; plan her değişiklikte yeniden hesaplanır.

![Nöbetçi arayüzü](docs/ekran-goruntusu.png)

**Teknoloji:** Bağımlılıksız (vanilla) JavaScript, Leaflet harita, Web Worker ile arka planda hesap. Çalıştırmak için yalnızca Node.js (18 veya üstü) gerekir.

## Hızlı başlangıç (Windows)

0. **Klasörün tamamını indirin:** GitHub depo sayfasında yeşil **Code** düğmesi → **Download ZIP**. Zip'e sağ tıklayıp **Tümünü ayıkla** deyin. `.bat` dosyasını tek başına indirmeyin ve zip'in içinden çalıştırmayın; yanında `kurulum.ps1`, `sunucu.js` ve `uygulama/` olmalıdır.
1. Ayıklanan klasörde `1_KUR_VE_CALISTIR.bat` → Node.js yoksa kurar (winget), hesap motoru testlerini çalıştırır ve uygulamayı tarayıcıda açar.
2. Sonraki açılışlarda `2_BASLAT.bat` yeterlidir.
3. Tarayıcı açılmazsa **http://127.0.0.1:8080/** adresine gidin (8080 doluysa sunucu bir sonraki boş bağlantı noktasını kullanır ve adresi pencerede yazar).

Uydu haritası ve ikonlar internetten yüklendiği için internet bağlantısı gerekir.

### Elle çalıştırma (Windows, macOS, Linux)

```bash
npm start      # sunucuyu başlatır ve tarayıcıyı açar
npm test       # hesap motoru testleri
```

## Neler yapar

- **7/24 güvenlik devriyesi (varsayılan görev):** Varsayılan alan, Bakırköy'de Ataköy Konakları ile Hava Harp Okulu arasıdır (Ayamama kanalı, sahil, Rauf Orbay Caddesi; yaklaşık 81 ha). Uygulama bu alan için şunları hesaplar:
  - aynı anda kaç drone'un devriyede olacağı ve kaç hazır yedek tutulacağı (güvenlik hedefi),
  - drone sayısına ve şarj yuvasına göre şarj/kalkış istasyonlarının sayısı ve yeri,
  - tamir istasyonunun yeri,
  - görev devirleri, batarya değişimleri, şarj kuyruğu,
  - rastgele arızalar ve tamir süreci (bkz. [Güvenlik algoritması](#güvenlik-algoritması)).
- **Birden fazla arsa ve kalkış noktası:** Haritada çizilir, sürüklenerek düzeltilir.
- **Otomatik drone seçimi:** Her drone, arsa ve kalkış noktası çifti için rüzgâr sınırı, menzil, iş hızı, hektar başına enerji, yedek batarya ve şarj süresi hesaplanır. Öncelik ayarına göre en uygun dronelar seçilir, gerisi nedeniyle birlikte yedekte gösterilir. İstenirse atama elle yapılır.
- **İrtifa belirleme:** Hedef görüntü çözünürlüğünden (cm/piksel) irtifa hesaplanır; en yüksek engel, güvenlik payı, arazi kot farkı ve yasal üst sınır (varsayılan 120 m) arasına çekilir. Aynı arsayı veya kalkışı paylaşan dronelar ayrı irtifa katmanlarında uçar.
- **Üç görev türü:** Alan tarama (bindirmeli şeritler), çevre devriyesi, ilgi noktası kontrolü (en kısa ziyaret sırası).
- **Sürekli gözlem:** Gözlem süresi boyunca döngüler tekrarlanır; batarya değişimi, yedek batarya ve şarj sırası planlanır. Her arsa için tekrar aralığı, görevdeki drone sayısı ve boş kalınan süre gösterilir.
- **Enerji modeli:** Çok rotorlu ve sabit kanat güç modelleri, rüzgârın irtifayla artışı, hava yoğunluğu, sıcaklığın bataryaya etkisi, dönüş kayıpları, benzinli dronelar için yakıt tüketimi.
- **Simülasyon:** Haritada canlı uçuş, 6 gösterge (hız, yönelim, irtifa, batarya, baş açısı, dikey hız) ve zaman damgalı kayıt tablosu.
- **Dışa aktarma:** Her drone için QGroundControl'ün açabileceği `.plan` görev dosyası; tüm ayarları JSON olarak indirme ve geri yükleme.

## Güvenlik algoritması

Öncelik sırası sabittir: **güvenlik > hazır yedek > enerji ve süre.**

1. **Devriye rotası:** Alan, kamera izi genişliğinde iç içe halkalarla kaplanır ve tek kapalı rota oluşturulur. Hedef sayıda "devriye yuvası" bu rotada eşit aralıkla döner; her yuvada her an bir drone bulunması hedeflenir.
2. **Şarj ve kalkış istasyonları:**
   - **Sayı:** en az `uygun drone ÷ istasyon başına şarj yuvası` istasyon kurulur. 4 ve üzeri dronede, tek bir istasyonun devre dışı kalmasına karşı en az 2 istasyon olur. Rotanın en uzak noktası en kısa menzilin dörtte birinden uzaksa sayı artırılır.
   - **Konum:** rotaya ortalama mesafeyi en aza indiren p-medyan çözümüyle seçilir (önce açgözlü başlangıç, sonra takas iyileştirmesi).
3. **Tamir istasyonu:** Arıza noktalarına gidiş ve tamirden sonra istasyonlara teslim yolunun toplamını en aza indiren konum.
4. **Görev devri (sıcak devir):** Görevdeki drone'un rezerv sınırına kalan süresi, en yakın hazır drone'un varış süresi artı devir payına inince yedek kalkar. Yedek yuvaya vardığında görevdeki drone istasyonuna döner; böylece devirlerde boşluk oluşmaz.
5. **Batarya ve şarj:** Biten batarya, istasyondaki şarj yuvalarında sırayla şarj edilir. Şarjlı yedek batarya yoksa drone şarjın bitmesini bekler.
6. **Rastgele arızalar:** Uçuştaki her drone, ortalama arızalar arası süreyle (MTBF) rastgele arızalanır.
   - **Kritik arıza:** acil iniş; kurtarma aracı drone'u tamir istasyonuna taşır.
   - **Hafif arıza:** drone uçarak tamir istasyonuna gider.
   - Tamir bitince drone istasyonuna teslim edilir ve yeniden yedeğe katılır.
   - Arızada en yakın hazır drone hemen boş yuvaya kalkar. Güvenlik için gerekirse son yedek de kullanılır.
7. **En iyi düzenin seçimi:** Her istasyon sayısı, çok sayıda farklı rastgele arıza senaryosuyla (Monte Carlo) 24 saat benzetilir. Seçim sırası:
   1. kötü senaryolardaki (%10) kapsama,
   2. hazır yedek bulunurluğu,
   3. enerji,
   4. daha az istasyon.
8. **Filo yeterliliği:** Her drone'un devriyede geçirebildiği zaman oranı ile arıza ve tamir kaynaklı kullanılamazlık hesaplanır. Hedef için gereken asgari drone sayısı önerilir; filo yetersizse kritik uyarı verilir.

Benzetim 10 saniyelik adımlarla çalışır ve aynı rastgelelik tohumuyla aynı sonucu verir. Bulunan istasyonlar "İstasyonları kalkış noktası yap" düğmesiyle kalkış noktası olarak kaydedilebilir.

## Klasörler

| Klasör / dosya | İçerik |
|---|---|
| `uygulama/index.html` | Uygulamanın tamamı: arayüz, stiller ve `<script id="motor">` içindeki hesap motoru. |
| `testler/motor.test.js` | Hesap motoru testleri (`npm test`). |
| `araclar/csp-guncelle.js` | `index.html` içindeki betikler değişince güvenlik politikasındaki (CSP) özetleri yeniler (`npm run csp`). |
| `sunucu.js` | Yalnızca `uygulama/` klasörünü ve yalnızca bu bilgisayara (127.0.0.1) sunan küçük yerel sunucu. |
| `kurulum.ps1` | `1_KUR_VE_CALISTIR.bat` tarafından çalıştırılan kurulum betiği. |
| `docs/` | README görselleri. |

## Geliştirme notları

- `uygulama/index.html` içindeki bir betiği değiştirdikten sonra `npm run csp` çalıştırın; aksi halde tarayıcı güvenlik politikası betiği engeller.
- Hazır drone sınıfları yaklaşık değerlerdir. Filo sekmesine kendi dronelarınızın ağırlık, batarya ve kamera bilgilerini girin.
- Uygulama bir planlama aracıdır; drone'a canlı bağlanmaz. İndirilen `.plan` dosyasını uçuştan önce yer kontrol istasyonunda mutlaka kontrol edin ve yerel havacılık kurallarına uyun.

## GitHub'a yükleme

GitHub'da boş bir depo oluşturun (README eklemeden), sonra bu klasörde:

```bash
git init
git add .
git commit -m "Nöbetçi drone planlayıcı"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADI/DEPO_ADI.git
git push -u origin main
```

## Yararlanılan kaynaklar

Rota ve enerji fikirleri için incelenen açık kaynak projeler: udacity/CppND-Route-Planning-Project ve a-ngo/route-planning (A\*), cuntou0906/Route-Planning (GA, PSO, ACO), RoutingKit (CH, CCH), Telecominfraproject/oopt-gnpy, Dungyichao/Electric-Vehicle-Route-Planning (enerji ödüllü rota), Kasheftin/RoutePlanner (harita arayüzü). Arayüz düzeni Mali03/UAV-interface yer kontrol istasyonundan uyarlanmıştır. Döner kanat güç modeli: Zeng, Xu ve Zhang (2019).
