# blablacargo Projesi Sorun Listesi

## Açık Sorunlar

1.  **Kurye Ekranında Yanlış Alıcı Konumu:** Courier active jobs penceresinde görsel konumlar yanlış gösteriliyor; gönderici penceresinde adres kısmında yazdığımızdan farklı gösteriyor. Özellikle alıcının adresi metinden koordinatlara çevrilemiyor. Bu durum, `sender.html` sayfasında alıcı için sabit kodlanmış koordinatların gönderilmesi ve `server.js` tarafında adres metnini koordinatlara çeviren bir geocoding mekanizmasının olmamasından kaynaklanıyor.
2.  **Alıcı Onayı Kurye Ekranına Yansımıyor:** Alıcı kargoyu teslim aldığını onayladığı halde kuryenin ekranında (courier_active_job.html) gönderinin durumu 'onaylandı' olarak güncellenmiyor.

## Geliştirme İstekleri

1.  **Göndericiye Kurye Atama Bildirimi ve Konum Takibi Özelliği:** Tamamlandı.
    *   Bir kurye gönderiyi kabul ettiğinde, göndericiye (sender.html) bir bildirim gitmeli.
    *   Gönderici, kuryenin anlık konumunu bir harita üzerinde takip edebilmeli.
2.  **Yakınlık Tabanlı ve Kademeli Kurye Bildirimi:** Yeni bir gönderi oluşturulduğunda, bildirim sadece gönderinin alınacağı konuma en yakın kuryelere gitsin. Eğer ilk grup kurye belirli bir süre içinde işi kabul etmezse, bildirim bir sonraki en yakın kurye grubuna yayılsın.