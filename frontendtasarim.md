# blabla kargo - Frontend Tasarım Rotası

Bu doküman, blabla kargo uygulamasının kullanıcı arayüzü (UI) ve kullanıcı deneyimi (UX) prensiplerini ve yapısını özetlemektedir.

---

### **1. Genel Tasarım Prensipleri**

*   **Stil:** Modern, temiz ve kullanıcı dostu. Odak noktası harita ve anlık takip olmalı.
*   **Renk Paleti:**
    *   **Ana Renk (Marka Rengi):** Enerjik bir Mavi (Örn: `#007BFF`) - Güveni ve hızı temsil eder.
    *   **Yardımcı Renkler:**
        *   **Başarı/Onay:** Yeşil (Örn: `#28A745`) - "Teslim Edildi", "Kabul Edildi" gibi durumlar için.
        *   **Uyarı/Beklemede:** Turuncu/Sarı (Örn: `#FFC107`) - "Beklemede" gibi durumlar için.
        *   **Hata/İptal:** Kırmızı (Örn: `#DC3545`) - "İptal Edildi", "Hata" gibi durumlar için.
    *   **Nötr Renkler:** Gri tonları (Örn: `#F8F9FA` - arkaplan, `#6C757D` - metin).
*   **Tipografi:** Okunması kolay, sans-serif bir font ailesi (Örn: `Roboto`, `Open Sans` veya `Montserrat`).

---

### **2. Kullanıcı Rolleri ve Ana Ekranlar**

Uygulamada iki ana kullanıcı rolü bulunmaktadır: **Gönderici** ve **Kurye**.

#### **A. Gönderici Arayüzü**

1.  **Ana Ekran (Harita Odaklı):**
    *   Kullanıcının konumunu merkez alan bir harita.
    *   Yakındaki aktif kuryeleri gösteren ikonlar.
    *   "Yeni Gönderi Oluştur" butonu (CTA - Call to Action).
    *   Varsa, aktif gönderinin anlık durumunu gösteren bir kart.
    *   Geçmiş gönderilere ve profil ayarlarına erişim için bir menü/ikon.

2.  **Gönderi Oluşturma Formu (Adım Adım Sihirbaz):**
    *   **Adım 1: Paket Bilgileri:** Paket boyutu (küçük, orta, büyük), içerik açıklaması.
    *   **Adım 2: Alıcı Bilgileri:** Alıcı adı, telefon numarası, adres (haritadan seçme veya manuel giriş).
    *   **Adım 3: Özet ve Onay:** Tüm bilgilerin gösterildiği, fiyatın belirtildiği ve gönderi oluşturma butonunun olduğu son ekran.

3.  **Gönderi Takip Ekranı:**
    *   Gönderinin rotasını gösteren canlı harita (kurye konumu).
    *   Gönderi durumu (Kabul Edildi, Yolda, Teslim Edildi).
    *   Tahmini varış süresi.
    *   Kurye bilgileri (ad, puan, fotoğraf).
    *   Teslimat kodu.

4.  **Geçmiş Gönderiler Ekranı:**
    *   Tüm geçmiş gönderilerin listesi (tarih, alıcı, durum, fiyat).
    *   Her bir gönderinin detayına gitme imkanı.

5.  **Puanlama Ekranı:**
    *   Teslimat tamamlandıktan sonra açılan basit bir ekran.
    *   1-5 arası yıldız seçimi ve opsiyonel yorum alanı.

#### **B. Kurye Arayüzü**

1.  **Ana Ekran / İş Bildirimleri:**
    *   "Aktif" veya "Pasif" olma durumunu belirten bir anahtar (toggle).
    *   Aktif durumdayken, yakındaki yeni gönderi taleplerini gösteren bir liste veya kartlar. Her kartta (mesafe, kazanç, paket boyutu) bilgisi olmalı.
    *   "Kabul Et" ve "Reddet" butonları.

2.  **Aktif Görev Ekranı:**
    *   Kabul edilen görevin detayları.
    *   Harita üzerinde optimize edilmiş rota (önce göndericinin adresi, sonra alıcının adresi).
    *   **Durum Güncelleme Butonları:**
        *   "Paketi Teslim Aldım"
        *   "Paketi Teslim Ettim" (bu butona basınca teslimat kodunu girmesi istenebilir).
    *   Gönderici ve alıcı iletişim bilgileri.

3.  **Kazanç ve Geçmiş Görevler Ekranı:**
    *   Günlük, haftalık, aylık kazanç özetleri.
    *   Tamamlanan tüm görevlerin listesi.

---

### **3. Ortak Bileşenler (Reusable Components)**

*   **Harita Bileşeni:** `Leaflet` veya `Mapbox` gibi bir kütüphane ile oluşturulmuş, pin'ler ve rotalar gösterebilen ortak bir harita.
*   **Durum Etiketleri:** Gönderi durumlarını (pending, accepted, in_transit vb.) belirtilen renklerde gösteren etiketler.
*   **Butonlar:** Ana (primary), ikincil (secondary) ve tehlike (danger) eylemleri için standart butonlar.
*   **Giriş Alanları (Input Fields):** Standart form elemanları.
*   **Modal/Popup'lar:** Onay pencereleri, bildirimler ve puanlama ekranı için.
