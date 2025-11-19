const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');

// ---- Server Setup ----
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('web'));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ---- In-Memory Database ----
const shipments = [];
let shipmentCounter = 1;
const courierLocations = new Map(); // courierId -> { latitude, longitude, timestamp }

// ---- Pricing & Geocoding Logic ----

// Geocode an address using Nominatim
async function geocodeAddress(address) {
    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                q: address,
                format: 'json',
                limit: 1
            },
            headers: {
                'User-Agent': 'Blablacargo/1.0'
            }
        });
        if (response.data && response.data.length > 0) {
            return {
                latitude: parseFloat(response.data[0].lat),
                longitude: parseFloat(response.data[0].lon)
            };
        }
        return null;
    } catch (error) {
        console.error('Geocoding error:', error.message);
        return null;
    }
}

// Reverse geocode coordinates to an address
async function reverseGeocode(lat, lon) {
    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
            params: {
                lat: lat,
                lon: lon,
                format: 'json'
            },
            headers: {
                'User-Agent': 'Blablacargo/1.0'
            }
        });
        if (response.data && response.data.display_name) {
            return response.data.display_name;
        }
        return 'Adres bulunamadı';
    } catch (error) {
        console.error('Reverse geocoding error:', error.message);
        return 'Adres alınamadı';
    }
}

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

// Define zones for Ankara (simple bounding boxes for demonstration)
const zones = {
    'Yapracik': { latMin: 39.88, latMax: 39.92, lonMin: 32.55, lonMax: 32.65 }, // Approximate
    'Kizilay': { latMin: 39.91, latMax: 39.93, lonMin: 32.84, lonMax: 32.86 }  // Approximate
};

function getZone(latitude, longitude) {
    for (const zoneName in zones) {
        const zone = zones[zoneName];
        if (latitude >= zone.latMin && latitude <= zone.latMax && longitude >= zone.lonMin && longitude <= zone.lonMax) {
            return zoneName;
        }
    }
    // A more robust implementation would define a default or larger zones
    return 'Diger'; 
}


// Calculate price based on zones and distance
function calculatePrice(senderCoords, receiverCoords) {
    const distance = calculateDistance(senderCoords.latitude, senderCoords.longitude, receiverCoords.latitude, receiverCoords.longitude);
    
    const senderZone = getZone(senderCoords.latitude, senderCoords.longitude);
    const receiverZone = getZone(receiverCoords.latitude, receiverCoords.longitude);

    let price = 0;
    
    // Rule: Uzak -> Merkez (e.g., Yapracik to Kizilay)
    if ((senderZone === 'Yapracik' && receiverZone === 'Kizilay') || (senderZone === 'Kizilay' && receiverZone === 'Yapracik')) {
        const baseFare = 180; // TL
        const perKmRate = 11.5; // TL/km
        price = baseFare + (distance * perKmRate);
    } 
    // Rule: Merkez ici veya kisa mesafe
    else if (distance <= 10) {
        const baseFare = 40; // TL
        const perKmRate = 22; // TL/km
        price = baseFare + (distance * perKmRate);
    }
    // Default rule for other long distances
    else {
        const baseFare = 50; // TL
        const perKmRate = 20; // TL/km
        price = baseFare + (distance * perKmRate);
    }

    return {
        price: Math.round(price * 100) / 100, // Return price rounded to 2 decimal places
        distance: distance
    };
}


// ---- WebSocket Logic ----
const couriers = new Map(); // courierId -> ws
const senders = new Map();  // shipmentId -> ws

wss.on('connection', (ws) => {
  console.log('Yeni bir istemci bağlandı.');

  ws.on('message', (message) => {
    try {
      const parsedMessage = JSON.parse(message);

      // 1. Client Registration
      if (parsedMessage.type === 'register') {
        const { role, id } = parsedMessage.data; // id can be shipmentId for senders

        if (role === 'courier') {
          const courierId = `kurye-${Math.random().toString(36).substring(2, 9)}`;
          // Store the websocket connection and the courier's status
          couriers.set(courierId, { ws: ws, status: 'inactive' });
          ws.clientId = courierId; // Associate ws with courierId for easy lookup
          ws.clientRole = 'courier';
          console.log(`Bir kurye kaydoldu: ${courierId}, Durum: Pasif`);
          ws.send(JSON.stringify({ type: 'welcome', message: `blabla kargo ağına bağlandınız. ID'niz: ${courierId}` }));
        
        } else if (role === 'sender' && id) {
          const shipmentId = id;
          senders.set(shipmentId, ws);
          ws.clientId = shipmentId; // Associate ws with shipmentId for easy lookup
          ws.clientRole = 'sender';
          console.log(`Gönderici ${shipmentId} gönderisi için kaydoldu.`);
          ws.send(JSON.stringify({ type: 'welcome', message: `Gönderi takip sistemine bağlandınız.` }));

          // Check if the shipment was accepted while the sender was offline
          const shipment = shipments.find(s => s.id === shipmentId);
          if (shipment && shipment.acceptedWhileSenderOffline) {
            console.log(`Gönderici ${shipmentId} offline iken kabul edilen gönderi için bildirim gönderiliyor.`);
            ws.send(JSON.stringify({ type: 'shipment_accepted', data: { courierId: shipment.courierId } }));
            delete shipment.acceptedWhileSenderOffline; // Remove flag after sending
          }
        }
      }

              // 2. Courier Location Update
            else if (parsedMessage.type === 'location_update' && ws.clientRole === 'courier') {
              const { latitude, longitude } = parsedMessage.data;
              const courierId = ws.clientId;
              courierLocations.set(courierId, { latitude, longitude, timestamp: new Date().toISOString() });
              console.log(`Kurye ${courierId} konumu güncellendi: ${latitude}, ${longitude}`);
      
              // Find active shipment for this courier and notify the sender
              const activeShipment = shipments.find(s => s.courierId === courierId && (s.status === 'accepted' || s.status === 'in_transit'));
              if (activeShipment) {
                const senderWs = senders.get(activeShipment.id);
                if (senderWs && senderWs.readyState === senderWs.OPEN) {
                  senderWs.send(JSON.stringify({ type: 'courier_location_update', data: { latitude, longitude } }));
                }
              }
            }
      
            // 3. Courier Status Update
            else if (parsedMessage.type === 'status_update' && ws.clientRole === 'courier') {
                const courierId = ws.clientId;
                const courierData = couriers.get(courierId);
                if (courierData) {
                    const newStatus = parsedMessage.data.status;
                    courierData.status = newStatus;
                    console.log(`Kurye ${courierId} durumu güncellendi: ${newStatus}`);
                }
            }    } catch (e) {
      console.error(`Gelen mesaj parse edilemedi:`, e);
    }
  });

  ws.on('close', () => {
    if (ws.clientId) {
      console.log(`${ws.clientRole} ${ws.clientId} bağlantıyı kesti.`);
      if (ws.clientRole === 'courier') {
        couriers.delete(ws.clientId);
        courierLocations.delete(ws.clientId);
      } else if (ws.clientRole === 'sender') {
        senders.delete(ws.clientId);
      }
    } else {
      console.log('Kaydolmamış bir istemci bağlantıyı kesti.');
    }
  });
});

function sendToCouriers(message, targetCourierIds = []) {
    const messageString = JSON.stringify(message);
    
    // If no specific courier IDs are provided, broadcast to all ACTIVE couriers
    if (targetCourierIds.length === 0) {
        couriers.forEach((courierData, courierId) => {
            // For new shipments, only send to active couriers
            if (message.type === 'new_shipment' && courierData.status !== 'active') {
                return; // Skip inactive couriers
            }
            
            // For other messages (like shipment_taken), send to all
            if (courierData.ws && courierData.ws.readyState === courierData.ws.OPEN) {
                courierData.ws.send(messageString);
            }
        });
    } else {
        // Send to a specific list of couriers
        targetCourierIds.forEach(courierId => {
            const courierData = couriers.get(courierId);
            if (courierData && courierData.ws && courierData.ws.readyState === courierData.ws.OPEN) {
                courierData.ws.send(messageString);
            }
        });
    }
}

function broadcast(message) {
    const messageString = JSON.stringify(message);
    console.log(`Broadcasting message to all clients: ${messageString}`);
    // Broadcast to all couriers
    couriers.forEach(courierData => {
        if (courierData.ws && courierData.ws.readyState === courierData.ws.OPEN) {
            courierData.ws.send(messageString);
        }
    });
    // Broadcast to all senders
    senders.forEach(ws => {
        if (ws.readyState === ws.OPEN) {
            ws.send(messageString);
        }
    });
}





// ---- API Endpoints ----

// Stage 1: Create Shipment
app.post('/shipments', async (req, res) => {
  const { sender, receiver, packageDetails } = req.body;
  
  // Basic validation
  if (!sender || !receiver || !packageDetails || !sender.latitude || !sender.longitude || !receiver.address) {
    return res.status(400).json({ error: 'Eksik gönderi bilgisi. Gönderici koordinatları ve alıcı adresi zorunludur.' });
  }

  // --- NEW: Automatically determine sender address ---
  sender.address = await reverseGeocode(sender.latitude, sender.longitude);
  // -------------------------------------------------

  // Geocode receiver's address
  const receiverCoords = await geocodeAddress(receiver.address);
  if (!receiverCoords) {
      return res.status(400).json({ error: 'Alıcı adresi bulunamadı veya geçersiz.' });
  }

  // Calculate the price and distance
  const { price, distance } = calculatePrice({ latitude: sender.latitude, longitude: sender.longitude }, receiverCoords);

  // Calculate earnings breakdown based on the new rule (10% company, 5% SMA, 85% courier)
  const smaDonation = price * 0.05;
  const companyShare = price * 0.10;
  const totalDeduction = smaDonation + companyShare;

  const courierGrossPayout = price - totalDeduction;
  const estimatedFuelCost = distance * 1.75; // 1.75 TL per km
  const otherCosts = courierGrossPayout * 0.10; // 10% for tax, maintenance etc.
  const courierNetProfit = courierGrossPayout - estimatedFuelCost - otherCosts;

  const earningsBreakdown = {
      musteri_fiyati: price.toFixed(2),
      sma_tedavisi_katkisi: smaDonation.toFixed(2),
      sirket_net_kari: companyShare.toFixed(2),
      kurye_brut_kazanc: courierGrossPayout.toFixed(2),
      tahmini_yakit_gideri: estimatedFuelCost.toFixed(2),
      diger_giderler: otherCosts.toFixed(2),
      kurye_net_kar: courierNetProfit.toFixed(2)
  };

  const newShipment = {
    id: `blabla-${shipmentCounter++}`,
    status: 'pending',
    deliveryCode: Math.floor(1000 + Math.random() * 9000).toString(),
    sender,
    receiver: {
        ...receiver,
        latitude: receiverCoords.latitude,
        longitude: receiverCoords.longitude
    },
    packageDetails,
    price: price,
    earnings_breakdown: earningsBreakdown, // Add the breakdown
    createdAt: new Date().toISOString(),
    courierId: null,
    rating: null,
    comment: null,
    confirmationToken: null,
  };
  shipments.push(newShipment);
  console.log(`Yeni gönderi oluşturuldu: ${newShipment.id}, Fiyat: ${newShipment.price} TL, Kurye Net Kâr: ${newShipment.earnings_breakdown.kurye_net_kar} TL, SMA Tedavisi Katkısı: ${newShipment.earnings_breakdown.sma_tedavisi_katkisi} TL`);

  // Find nearby active couriers and send them the new shipment notification
  const senderCoords = { latitude: newShipment.sender.latitude, longitude: newShipment.sender.longitude };
  const nearbyCourierIds = [];
  couriers.forEach((courierData, courierId) => {
      if (courierData.status === 'active') {
          const courierLocation = courierLocations.get(courierId);
          if (courierLocation) {
              const distance = calculateDistance(senderCoords.latitude, senderCoords.longitude, courierLocation.latitude, courierLocation.longitude);
              if (distance <= 15) { // 15 km radius
                  nearbyCourierIds.push(courierId);
              }
          }
      }
  });

  console.log(`Yeni gönderi için ${nearbyCourierIds.length} uygun kurye bulundu. Bildirim gönderiliyor...`);
  sendToCouriers({ type: 'new_shipment', data: newShipment }, nearbyCourierIds);

  res.status(201).json({ message: 'Gönderi başarıyla oluşturuldu...', shipment: newShipment });
});

// Stage 2: Accept Shipment
app.post('/shipments/:id/accept', (req, res) => {
    const shipmentId = req.params.id;
    const { courierId } = req.body;
    if (!courierId) return res.status(400).json({ error: 'Kurye ID\'si gerekli.' });
    const shipment = shipments.find(s => s.id === shipmentId);
    if (!shipment) return res.status(404).json({ error: 'Gönderi bulunamadı.' });
    if (shipment.status !== 'pending') return res.status(409).json({ error: 'Gönderi zaten kabul edilmiş.' });
    
    shipment.status = 'accepted';
    shipment.courierId = courierId;
    console.log(`Gönderi ${shipmentId}, kurye ${courierId} tarafından kabul edildi.`);
    
    sendToCouriers({ type: 'shipment_taken', data: { id: shipmentId } }); // Use new sendToCouriers

    const senderWs = senders.get(shipmentId);
    if (senderWs && senderWs.readyState === senderWs.OPEN) {
        console.log(`Gönderici ${shipmentId} için bildirim gönderiliyor.`);
        senderWs.send(JSON.stringify({ type: 'shipment_accepted', data: { courierId: courierId } }));
    } else {
        console.log(`Gönderici ${shipmentId} offline. Bildirim daha sonra gönderilmek üzere işaretlendi.`);
        shipment.acceptedWhileSenderOffline = true; // Set flag
    }

    res.status(200).json({ message: 'Gönderi başarıyla kabul edildi.', shipment });
});

// Stage 3: Pickup Shipment
app.post('/shipments/:id/pickup', (req, res) => {
    const shipmentId = req.params.id;
    const { courierId } = req.body;
    if (!courierId) return res.status(400).json({ error: 'Kurye ID\'si gerekli.' });
    const shipment = shipments.find(s => s.id === shipmentId);
    if (!shipment) return res.status(404).json({ error: 'Gönderi bulunamadı.' });
    if (shipment.courierId !== courierId) return res.status(403).json({ error: 'Bu gönderi için yetkiniz yok.' });
    if (shipment.status !== 'accepted') return res.status(409).json({ error: 'Gönderi \'kabul edildi\' durumunda değil.' });
    shipment.status = 'in_transit';
    console.log(`Gönderi ${shipmentId}, kurye ${courierId} tarafından teslim alındı. Durum: ${shipment.status}`);
    res.status(200).json({ message: 'Gönderi teslim alındı ve yola çıktı.', shipment });
});

// Stage 4: Initiate Delivery Confirmation
app.post('/shipments/:id/deliver', (req, res) => {
    const shipmentId = req.params.id;
    const { courierId, deliveryCode } = req.body;
    if (!courierId || !deliveryCode) return res.status(400).json({ error: 'Kurye ID\'si ve Teslimat Kodu gerekli.' });
    const shipment = shipments.find(s => s.id === shipmentId);
    if (!shipment) return res.status(404).json({ error: 'Gönderi bulunamadı.' });
    if (shipment.courierId !== courierId) return res.status(403).json({ error: 'Bu gönderi için yetkiniz yok.' });
    if (shipment.status !== 'in_transit') return res.status(409).json({ error: 'Gönderi \'yolda\' durumunda değil.' });
    if (shipment.deliveryCode !== deliveryCode) return res.status(403).json({ error: 'Teslimat Kodu yanlış.' });

    // Generate a unique confirmation token
    shipment.confirmationToken = crypto.randomBytes(20).toString('hex');
    shipment.status = 'awaiting_confirmation';

    const confirmationLink = `/confirm-delivery.html?token=${shipment.confirmationToken}`;

    console.log(`Gönderi ${shipmentId} için alıcı onayı bekleniyor. Onay Linki: ${confirmationLink}`);

    // In a real app, you would send this link to the receiver via SMS or email.
    res.status(200).json({ message: 'Alıcı onayı bekleniyor.', confirmationLink: confirmationLink, shipment });
});

// New Endpoint for Receiver Confirmation
app.post('/shipments/confirm-delivery', (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Onay token\'ı gerekli.' });
    }

    const shipment = shipments.find(s => s.confirmationToken === token && s.status === 'awaiting_confirmation');

    if (!shipment) {
        return res.status(404).json({ error: 'Geçersiz veya daha önce kullanılmış onay token\'ı.' });
    }

    shipment.status = 'delivered';
    shipment.confirmationToken = null; // Invalidate the token after use

    console.log(`Gönderi ${shipment.id} alıcı tarafından onaylandı ve teslim edildi.`);

    // Notify all clients that the shipment has been updated
    broadcast({ type: 'shipment_updated', data: { id: shipment.id, status: shipment.status } });

    res.status(200).json({ message: 'Teslimat başarıyla onaylandı.', shipment });
});

// Stage 5: Rate Shipment
app.post('/shipments/:id/rate', (req, res) => {
    const shipmentId = req.params.id;
    const { rating, comment } = req.body; // Assuming rating is 1-5, comment is optional

    if (rating === undefined || rating === null || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Geçerli bir puan (1-5 arası) gerekli.' });
    }

    const shipment = shipments.find(s => s.id === shipmentId);

    if (!shipment) {
        return res.status(404).json({ error: 'Gönderi bulunamadı.' });
    }

    if (shipment.status !== 'delivered') {
        return res.status(409).json({ error: 'Sadece teslim edilmiş gönderiler puanlanabilir.' });
    }

    if (shipment.rating !== null) {
        return res.status(409).json({ error: 'Bu gönderi zaten puanlanmış.' });
    }

    shipment.rating = rating;
    shipment.comment = comment || null;
    console.log(`Gönderi ${shipmentId} puanlandı: ${rating} yıldız, Yorum: ${comment || 'Yok'}`);

    // Notify the specific courier that their stats have been updated
    if (shipment.courierId) {
        const courierData = couriers.get(shipment.courierId);
        if (courierData && courierData.ws && courierData.ws.readyState === courierData.ws.OPEN) {
            console.log(`Kurye ${shipment.courierId} için 'stats_updated' bildirimi gönderiliyor.`);
            courierData.ws.send(JSON.stringify({ type: 'stats_updated' }));
        } else {
            console.log(`Kurye ${shipment.courierId} bulunamadı veya bağlantısı aktif değil. Bildirim gönderilemedi.`);
        }
    }

    // In a real app, this would update the courier's overall rating.
    res.status(200).json({ message: 'Gönderi başarıyla puanlandı.', shipment });
});

// GET Courier Stats
app.get('/couriers/:courierId/stats', (req, res) => {
    const { courierId } = req.params;
    console.log(`'${courierId}' için istatistikler isteniyor...`);

    const courierShipments = shipments.filter(s => s.courierId === courierId && s.status === 'delivered' && s.rating !== null);
    console.log(`Bulunan puanlanmış gönderi sayısı: ${courierShipments.length}`);

    if (courierShipments.length === 0) {
        return res.status(200).json({
            averageRating: 0,
            totalRatings: 0,
            message: 'Bu kurye için henüz bir değerlendirme bulunmuyor.'
        });
    }

    const totalRating = courierShipments.reduce((acc, s) => acc + s.rating, 0);
    const averageRating = totalRating / courierShipments.length;
    console.log(`Hesaplanan ortalama puan: ${averageRating}`);

    res.status(200).json({
        averageRating: averageRating.toFixed(2),
        totalRatings: courierShipments.length
    });
});

// GET Courier Feedback (Ratings and Comments)
app.get('/couriers/:courierId/feedback', (req, res) => {
    const { courierId } = req.params;
    console.log(`'${courierId}' için geri bildirimler isteniyor...`);

    const feedbackShipments = shipments.filter(s => 
        s.courierId === courierId && 
        s.status === 'delivered' && 
        s.rating !== null && 
        s.comment !== null && 
        s.comment.trim() !== ''
    ).map(s => ({
        shipmentId: s.id,
        rating: s.rating,
        comment: s.comment,
        sender: s.sender.name || 'Bilinmiyor', // Assuming sender has a name
        createdAt: s.createdAt
    }));

    if (feedbackShipments.length === 0) {
        return res.status(200).json({
            message: 'Bu kurye için henüz bir geri bildirim bulunmuyor.',
            feedback: []
        });
    }

    res.status(200).json({
        message: 'Geri bildirimler başarıyla alındı.',
        feedback: feedbackShipments
    });
});

// ---- Route Optimization ----

// Helper function to calculate Euclidean distance
function getDistance(point1, point2) {
    return Math.sqrt(Math.pow(point1.latitude - point2.latitude, 2) + Math.pow(point1.longitude - point2.longitude, 2));
}

// Find the nearest waypoint from a given point
function findNearest(currentPoint, waypoints) {
    let nearest = null;
    let minDistance = Infinity;
    waypoints.forEach((waypoint, index) => {
        const distance = getDistance(currentPoint, waypoint.location);
        if (distance < minDistance) {
            minDistance = distance;
            nearest = { ...waypoint, index };
        }
    });
    return nearest;
}

app.post('/couriers/:courierId/optimize-route', (req, res) => {
    const { courierId } = req.params;
    const courierLocation = courierLocations.get(courierId);

    if (!courierLocation) {
        return res.status(404).json({ error: 'Kurye konumu bulunamadı veya kurye online değil.' });
    }

    // 1. Gather all waypoints for the courier
    const courierShipments = shipments.filter(s => s.courierId === courierId && s.status === 'accepted');
    if (courierShipments.length === 0) {
        return res.status(200).json({ message: 'Kuryeye atanmış aktif gönderi bulunmuyor.', route: [] });
    }

    let waypoints = [];
    courierShipments.forEach(shipment => {
        // Add pickup location
        waypoints.push({
            type: 'pickup',
            shipmentId: shipment.id,
            location: shipment.sender,
            address: shipment.sender.address // Assuming address is part of sender object
        });
        // Add delivery location
        waypoints.push({
            type: 'delivery',
            shipmentId: shipment.id,
            location: shipment.receiver,
            address: shipment.receiver.address // Assuming address is part of receiver object
        });
    });

    // 2. Calculate the optimized route using nearest neighbor algorithm
    const optimizedRoute = [];
    let currentPoint = courierLocation;

    while (waypoints.length > 0) {
        const nearest = findNearest(currentPoint, waypoints);
        if (nearest) {
            // Add the nearest waypoint to the route
            optimizedRoute.push(nearest);
            // Update the current point to the location of the waypoint we just added
            currentPoint = nearest.location;
            // Remove the found waypoint from the list of waypoints
            waypoints.splice(nearest.index, 1);
        } else {
            // Should not happen if waypoints list is not empty
            break;
        }
    }

    res.status(200).json({
        message: 'Optimize edilmiş rota başarıyla oluşturuldu.',
        startLocation: courierLocation,
        route: optimizedRoute
    });
});


// Get shipment status
app.get('/shipments/:id', (req, res) => {
    const shipmentId = req.params.id;
    const shipment = shipments.find(s => s.id === shipmentId);
    if (shipment) {
        if (shipment.status === 'in_transit' && shipment.courierId && courierLocations.has(shipment.courierId)) {
            res.status(200).json({ ...shipment, courierLocation: courierLocations.get(shipment.courierId) });
        } else {
            res.status(200).json(shipment);
        }
    } else {
        res.status(404).json({ error: 'Gönderi bulunamadı.' });
    }
});

// ---- Start the Server ----
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`blabla kargo sunucusu ${PORT} portunda dinleniyor.`);
});

