### **blabla kargo - Teslimat Rotası**

#### **Aşama 1: Gönderi Oluşturma (Mevcut Durum)**

*   **Kim:** Gönderici
*   **Ne Yapar:** Uygulama üzerinden paket, alıcı ve adres bilgilerini girerek bir gönderi talebi oluşturur.
*   **Sistem Ne Yapar:**
    1.  Gönderiyi "Beklemede" (Pending) durumuyla veritabanına kaydeder.
    2.  Yakındaki tüm "Aktif" durumdaki kuryelere anlık bildirim (WebSocket) gönderir.
*   **Gereken Özellik:** `/shipments` POST endpoint'i. **(Bunu zaten yaptık)**

---

#### **Aşama 2: Kurye Kabul Süreci (Sıradaki Adım)**

*   **Kim:** Kurye
*   **Ne Yapar:** Gelen iş bildirimini inceler (mesafe, kazanç, paket boyutu) ve "Kabul Et" butonuna basar.
*   **Sistem Ne Yapar:**
    1.  İşi ilk kabul eden kuryeye gönderiyi atar.
    2.  Gönderinin durumunu "Kabul Edildi" (Accepted) olarak günceller.
    3.  **Önemli:** Bu gönderiyi diğer tüm kuryelerin ekranından kaldırır.
    4.  Göndericiye "Kuryeniz bulundu: [Kurye Adı]. Şu an yola çıktı." şeklinde bir bildirim gönderir.
*   **Gereken Yeni Özellik:** Kuryenin bir işi kabul edebileceği yeni bir API endpoint'i, örneğin: `/shipments/:id/accept`

---

#### **Aşama 3: Taşıma Süreci**

*   **Kim:** Kurye
*   **Ne Yapar:**
    1.  Göndericinin adresine gidip paketi teslim alır. Uygulamada "Paketi Aldım" butonuna basar.
    2.  Alıcının adresine doğru yola çıkar.
*   **Sistem Ne Yapar:**
    1.  Gönderinin durumunu "Yolda" (In Transit) olarak günceller.
    2.  Kuryenin anlık konum verisini (GPS) alıp hem göndericinin hem de alıcının haritasında canlı olarak gösterir.
*   **Gereken Yeni Özellik:** Kuryenin durum güncellemesi yapabileceği bir endpoint (`/shipments/:id/pickup`) ve konum verisini sunucuya sürekli ileten bir WebSocket mekanizması.

---

#### **Aşama 4: Teslimatın Tamamlanması**

*   **Kim:** Kurye ve Alıcı
*   **Ne Yapar:** Kurye, paketi alıcıya teslim eder. Uygulamada "Teslim Edildi" butonuna basar. (Güvenlik için alıcıdan bir kod alması veya alıcının imzasını alması istenebilir).
*   **Sistem Ne Yapar:**
    1.  Gönderinin durumunu "Teslim Edildi" (Delivered) olarak günceller.
    2.  Göndericiye "Paketiniz başarıyla teslim edildi" bildirimini gönderir.
    3.  Kuryenin kazancını "hesabına" yansıtır.
*   **Gereken Yeni Özellik:** Teslimatı tamamlayan bir endpoint: `/shipments/:id/deliver`

---

#### **Aşama 5: Değerlendirme**

*   **Kim:** Gönderici ve Alıcı
*   **Ne Yapar:** Teslimat tamamlandıktan sonra kuryeyi (ve hizmeti) puanlar ve yorum yapar.
*   **Sistem Ne Yapar:** Kuryelerin puan ortalamasını günceller. Bu, hizmet kalitesini korumak için önemlidir.
*   **Gereken Yeni Özellik:** Puanlama ve yorum için yeni bir endpoint.

---

#### **Aşama 6: İptal Süreci**

*   **Kim:** Gönderici veya Kurye
*   **Ne Yapar:** Gönderici, paketi kurye almadan önce iptal edebilir. Kurye ise acil durumlarda kabul ettiği bir işi iptal edebilir.
*   **Sistem Ne Yapar:**
    1.  Gönderinin durumunu "İptal Edildi" (Cancelled) olarak günceller.
    2.  İptal eden tarafa ve diğer ilgili taraflara (eğer varsa) bildirim gönderir.
    3.  Gerekirse iptal nedenini kaydeder.
*   **Gereken Yeni Özellik:** Gönderiyi iptal etmek için bir API endpoint'i, örneğin: `/shipments/:id/cancel`

---

#### **Aşama 7: Teslimat Sorunları ve İade Süreci**

*   **Kim:** Kurye
*   **Ne Yapar:** Alıcının adreste bulunamaması, adresin yanlış olması veya paketin teslim edilememesi gibi durumlarda sorunu bildirir.
*   **Sistem Ne Yapar:**
    1.  Gönderinin durumunu "Sorunlu" (Problematic) veya "İade Sürecinde" (Returning) olarak günceller.
    2.  Göndericiye durum hakkında bilgi verir ve olası çözüm yollarını (örn: yeniden teslimat, iade) sunar.
    3.  Kuryeye paketi göndericiye iade etmesi için talimat verir.
*   **Gereken Yeni Özellik:** Teslimat sorununu bildirmek ve iade sürecini başlatmak için API endpoint'leri, örneğin: `/shipments/:id/report-issue` ve `/shipments/:id/initiate-return`