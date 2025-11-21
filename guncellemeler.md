# Yakınlık Tabanlı ve Genişleyen Yarıçaplı Kurye Bildirim Sistemi Güncellemesi

Bu güncelleme ile, yeni gönderi bildirimlerinin kuryelere ulaştırılma mantığı daha verimli ve akıllı bir hale getirilmiştir. Artık bildirimler tüm kuryelere aynı anda gönderilmek yerine, gönderinin çıkış noktasına en yakın olan kuryelere öncelik verilerek iletilmektedir.

## Nasıl Çalışır?

1.  **İlk Bildirim (10 km Yarıçap):**
    *   Yeni bir gönderi oluşturulduğunda, sistem gönderinin çıkış konumuna **10 km** yarıçap içindeki tüm **aktif** kuryeleri tespit eder.
    *   Gönderi bildirimi (`new_shipment`) sadece bu kuryelere gönderilir.

2.  **Otomatik Arama Genişletme:**
    *   Eğer gönderi **1 dakika** içinde hiçbir kurye tarafından kabul edilmezse, sistem arama yarıçapını otomatik olarak **10 km daha** artırır (yani 20 km'ye çıkarır).
    *   Bu yeni genişlemiş alan içinde kalan ve daha önce bildirim almamış yeni kuryelere bildirim gönderilir.
    *   Bu işlem, gönderi bir kurye tarafından kabul edilene kadar her dakika tekrarlanır (30 km, 40 km...).

3.  **Gönderi Kabul Edildiğinde:**
    *   Bir kurye gönderiyi kabul ettiği anda, o gönderi için çalışan otomatik arama genişletme zamanlayıcısı **durdurulur**.
    *   Diğer tüm kuryelere, gönderinin artık mevcut olmadığını belirten bir `shipment_taken` mesajı gönderilir. Bu sayede bildirim, diğer kuryelerin ekranlarından kaldırılır.

## Teknik Değişiklikler

Bu özellik `server.js` dosyasında aşağıdaki değişiklikler yapılarak hayata geçirilmiştir:

-   **`pendingShipmentNotifications` Değişkeni:** Kabul bekleyen gönderileri, mevcut arama yarıçaplarını ve zamanlayıcılarını takip etmek için bir `Map` nesnesi eklendi.
-   **`findAndNotifyCouriers(shipment)` Fonksiyonu:** Bildirim mantığını yöneten, kuryeleri bulan, bildirimi gönderen ve arama genişletme zamanlayıcısını kuran ana fonksiyon eklendi.
-   **`POST /shipments` Endpoint'i Güncellendi:** Bu endpoint artık yeni gönderi oluşturulduğunda `findAndNotifyCouriers` fonksiyonunu çağırarak dinamik arama sürecini başlatmaktadır.
-   **`POST /shipments/:id/accept` Endpoint'i Güncellendi:** Bu endpoint, gönderi kabul edildiğinde ilgili zamanlayıcıyı temizleyerek arama genişletme sürecini sonlandırmaktadır.
