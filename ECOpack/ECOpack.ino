/*
  ============================================================
                         ECOPACK
              ESP32 + Firebase + DHT11 + GPS
                 + Dynamic Fan/LED Control
  ============================================================

  HARDWARE
  ------------------------------------------------------------
  DHT11:
      DATA -> GPIO 4

  LED / FAN INDICATOR:
      -> GPIO 18

  GPS:
      GPS TX -> ESP32 GPIO 16
      GPS RX -> ESP32 GPIO 17

  ============================================================

  FIREBASE DATA FLOW
  ------------------------------------------------------------

  WEBSITE
      |
      | temperature limits
      v
  FIREBASE
      |
      | ESP32 reads limits
      v
  ESP32
      |
      | temperature > maximum
      v
  FAN SHOULD RUN
      |
      v
  LED BLINKS

  ESP32 also sends:

      temperature
      humidity
      fanStatus
      GPS
      online status

  ============================================================
*/


// ============================================================
// FIREBASE
// ============================================================

#define ENABLE_USER_AUTH
#define ENABLE_DATABASE

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <FirebaseClient.h>


// ============================================================
// DHT11
// ============================================================

#include <DHT.h>

#define DHT_PIN 4
#define DHT_TYPE DHT11

DHT dht(
  DHT_PIN,
  DHT_TYPE
);


// ============================================================
// GPS
// ============================================================

#include <HardwareSerial.h>
#include <TinyGPSPlus.h>

HardwareSerial GPS(2);

TinyGPSPlus gps;

#define GPS_RX 16
#define GPS_TX 17


// ============================================================
// LED / FAN INDICATOR
// ============================================================

#define LED_PIN 18


// ============================================================
// WIFI
// ============================================================

#define WIFI_SSID      "spboi"
#define WIFI_PASSWORD  "jewelstar"

#define API_KEY        "AIzaSyD6e6NvHzRGnwuCXBgf8etsOx0nMiRsoLI"

#define USER_EMAIL     "sabyasaachipradhan02@gmail.com"
#define USER_PASSWORD  "qwertyu"

#define DATABASE_URL   "https://ecopack-af91d-default-rtdb.asia-southeast1.firebasedatabase.app"



// ============================================================
// ECOPACK BOX
// ============================================================

/*
   OWNER_UID:
   UID of the normal ECOpack user.
*/

#define OWNER_UID      "lWAFcaDOxWgpMim0KkbGVGAnVMR2"

#define BOX_ID         "-P-L4xLeMIC008Ele9zD"


#define DEVICE_ID      "ESP32_BOX_01"


// ============================================================
// FIREBASE OBJECTS
// ============================================================

WiFiClientSecure ssl_client;

using AsyncClient = AsyncClientClass;

AsyncClient aClient(
  ssl_client
);


UserAuth user_auth(
  API_KEY,
  USER_EMAIL,
  USER_PASSWORD,
  3000
);


FirebaseApp app;

RealtimeDatabase Database;


// ============================================================
// TIMERS
// ============================================================

unsigned long lastHeartbeat = 0;

unsigned long lastSensorUpload = 0;

unsigned long lastGPSUpload = 0;

unsigned long lastConfigRead = 0;

unsigned long lastLEDBlink = 0;

unsigned long lastGPSMessage = 0;


// ------------------------------------------------------------
// Timing
// ------------------------------------------------------------

const unsigned long HEARTBEAT_INTERVAL =
  5000;


const unsigned long SENSOR_INTERVAL =
  5000;


const unsigned long GPS_UPLOAD_INTERVAL =
  5000;


/*
   Read temperature limits every 3 seconds.

   This means changing the limits on the
   ECOpack website will normally reach the
   ESP32 within a few seconds.
*/

const unsigned long CONFIG_INTERVAL =
  3000;


/*
   LED blink speed when fan is ON.
*/

const unsigned long FAN_BLINK_INTERVAL =
  300;


// ============================================================
// DYNAMIC CONFIGURATION
// ============================================================

double temperatureMin = 0;

double temperatureMax = 0;

double humidityMin = 0;

double humidityMax = 0;


/*
   Whether valid temperature limits have been
   received from Firebase.
*/

bool temperatureLimitsValid =
  false;


/*
   Whether valid humidity limits have been
   received from Firebase.
*/

bool humidityLimitsValid =
  false;


/*
   Represents the REAL fan state.

   We don't have the actual fan connected yet,
   so GPIO 18 LED represents it.
*/

bool fanShouldRun =
  false;


/*
   Current LED state for blinking.
*/

bool ledState =
  false;


// ============================================================
// FUNCTION DECLARATIONS
// ============================================================

void auth_debug_print(
  AsyncResult &aResult
);


void sendHeartbeat();

void readAndUploadSensors();

void readGPS();

void uploadGPSData();

void readConfiguration();

void updateFanControl(
  double temperature
);

void updateFanLED();

void publishFanStatus();

void printFirebaseError(
  const char *operation
);


// ============================================================
// FIREBASE AUTH DEBUG
// ============================================================

void auth_debug_print(
  AsyncResult &aResult
)
{
  if (!aResult.isResult())
    return;


  if (aResult.isEvent())
  {
    Firebase.printf(
      "Event task: %s, msg: %s, code: %d\n",
      aResult.uid().c_str(),
      aResult.eventLog().message().c_str(),
      aResult.eventLog().code()
    );
  }


  if (aResult.isDebug())
  {
    Firebase.printf(
      "Debug task: %s, msg: %s\n",
      aResult.uid().c_str(),
      aResult.debug().c_str()
    );
  }


  if (aResult.isError())
  {
    Firebase.printf(
      "Error task: %s, msg: %s, code: %d\n",
      aResult.uid().c_str(),
      aResult.error().message().c_str(),
      aResult.error().code()
    );
  }
}


// ============================================================
// SETUP
// ============================================================

void setup()
{
  Serial.begin(
    115200
  );


  delay(1000);


  // ----------------------------------------------------------
  // STARTUP
  // ----------------------------------------------------------

  Serial.println();

  Serial.println(
    "================================================"
  );

  Serial.println(
    "              ECOPACK ESP32"
  );

  Serial.println(
    "================================================"
  );

  Serial.println(
    "DHT11 + GPS + Firebase + Dynamic Fan Control"
  );

  Serial.println();


  // ----------------------------------------------------------
  // LED
  // ----------------------------------------------------------

  pinMode(
    LED_PIN,
    OUTPUT
  );


  digitalWrite(
    LED_PIN,
    LOW
  );


  // ----------------------------------------------------------
  // DHT11
  // ----------------------------------------------------------

  dht.begin();


  Serial.println(
    "[OK] DHT11 initialized"
  );


  // ----------------------------------------------------------
  // GPS
  // ----------------------------------------------------------

  GPS.begin(
    9600,
    SERIAL_8N1,
    GPS_RX,
    GPS_TX
  );


  Serial.println(
    "[OK] GPS initialized"
  );


  // ----------------------------------------------------------
  // WIFI
  // ----------------------------------------------------------

  Serial.println();

  Serial.print(
    "Connecting to WiFi"
  );


  WiFi.begin(
    WIFI_SSID,
    WIFI_PASSWORD
  );


  while (
    WiFi.status() != WL_CONNECTED
  )
  {
    Serial.print(
      "."
    );

    delay(500);
  }


  Serial.println();

  Serial.println(
    "[OK] WiFi connected"
  );


  Serial.print(
    "ESP32 IP: "
  );


  Serial.println(
    WiFi.localIP()
  );


  // ----------------------------------------------------------
  // FIREBASE SSL
  // ----------------------------------------------------------

  ssl_client.setInsecure();


  ssl_client.setConnectionTimeout(
    1000
  );


  ssl_client.setHandshakeTimeout(
    5
  );


  // ----------------------------------------------------------
  // FIREBASE INIT
  // ----------------------------------------------------------

  Serial.println();

  Serial.println(
    "Initializing Firebase..."
  );


  initializeApp(
    aClient,
    app,
    getAuth(user_auth),
    auth_debug_print,
    "ecopackAuth"
  );


  app.getApp<RealtimeDatabase>(
    Database
  );


  Database.url(
    DATABASE_URL
  );


  Serial.println(
    "[OK] Firebase initialized"
  );


  Serial.println();

  Serial.println(
    "Waiting for Firebase authentication..."
  );
}


// ============================================================
// LOOP
// ============================================================

void loop()
{
  /*
     Firebase background tasks.
  */

  app.loop();


  /*
     Keep GPS running even while Firebase
     authentication is not ready.
  */

  readGPS();


  /*
     Don't access Firebase until authenticated.
  */

  if (!app.ready())
  {
    updateFanLED();

    delay(5);

    return;
  }


  // ----------------------------------------------------------
  // HEARTBEAT
  // ----------------------------------------------------------

  if (
    millis() -
    lastHeartbeat >=
    HEARTBEAT_INTERVAL
  )
  {
    lastHeartbeat =
      millis();


    sendHeartbeat();
  }


  // ----------------------------------------------------------
  // READ WEBSITE CONFIGURATION
  // ----------------------------------------------------------

  if (
    millis() -
    lastConfigRead >=
    CONFIG_INTERVAL
  )
  {
    lastConfigRead =
      millis();


    readConfiguration();
  }


  // ----------------------------------------------------------
  // DHT11
  // ----------------------------------------------------------

  if (
    millis() -
    lastSensorUpload >=
    SENSOR_INTERVAL
  )
  {
    lastSensorUpload =
      millis();


    readAndUploadSensors();
  }


  // ----------------------------------------------------------
  // FAN LED
  // ----------------------------------------------------------

  updateFanLED();


  delay(5);
}


// ============================================================
// READ CONFIGURATION FROM FIREBASE
// ============================================================

void readConfiguration()
{
  String basePath =
    "/boxes/" +
    String(OWNER_UID) +
    "/" +
    String(BOX_ID) +
    "/configuration";


  Serial.println();

  Serial.println(
    "[Firebase] Reading temperature/humidity limits..."
  );


  /*
     TEMPERATURE MIN
  */

  double newTemperatureMin =
    Database.get<double>(
      aClient,
      basePath +
      "/temperatureMin"
    );


  if (
    aClient.lastError().code() != 0
  )
  {
    printFirebaseError(
      "configuration/temperatureMin"
    );

    return;
  }


  /*
     TEMPERATURE MAX
  */

  double newTemperatureMax =
    Database.get<double>(
      aClient,
      basePath +
      "/temperatureMax"
    );


  if (
    aClient.lastError().code() != 0
  )
  {
    printFirebaseError(
      "configuration/temperatureMax"
    );

    return;
  }


  /*
     HUMIDITY MIN
  */

  double newHumidityMin =
    Database.get<double>(
      aClient,
      basePath +
      "/humidityMin"
    );


  if (
    aClient.lastError().code() != 0
  )
  {
    printFirebaseError(
      "configuration/humidityMin"
    );

    return;
  }


  /*
     HUMIDITY MAX
  */

  double newHumidityMax =
    Database.get<double>(
      aClient,
      basePath +
      "/humidityMax"
    );


  if (
    aClient.lastError().code() != 0
  )
  {
    printFirebaseError(
      "configuration/humidityMax"
    );

    return;
  }


  /*
     Store the new values.
  */

  temperatureMin =
    newTemperatureMin;


  temperatureMax =
    newTemperatureMax;


  humidityMin =
    newHumidityMin;


  humidityMax =
    newHumidityMax;


  /*
     Validate temperature limits.
  */

  temperatureLimitsValid =
    temperatureMin <
    temperatureMax;


  /*
     Validate humidity limits.
  */

  humidityLimitsValid =
    humidityMin >= 0 &&
    humidityMax <= 100 &&
    humidityMin <
    humidityMax;


  Serial.println(
    "[Firebase] Configuration received:"
  );


  Serial.print(
    "Temperature: "
  );

  Serial.print(
    temperatureMin
  );

  Serial.print(
    " - "
  );

  Serial.println(
    temperatureMax
  );


  Serial.print(
    "Humidity: "
  );

  Serial.print(
    humidityMin
  );

  Serial.print(
    " - "
  );

  Serial.println(
    humidityMax
  );


  /*
     If limits are valid and we already have
     a temperature reading, the next sensor
     cycle will immediately recalculate the fan.
  */

  if (
    !temperatureLimitsValid
  )
  {
    fanShouldRun =
      false;

    digitalWrite(
      LED_PIN,
      LOW
    );


    Serial.println(
      "[FAN] Waiting for valid temperature limits."
    );
  }
}


// ============================================================
// READ DHT11 + CONTROL FAN
// ============================================================

void readAndUploadSensors()
{
  double temperature =
    dht.readTemperature();


  double humidity =
    dht.readHumidity();


  /*
     Check sensor.
  */

  if (
    isnan(temperature) ||
    isnan(humidity)
  )
  {
    Serial.println();

    Serial.println(
      "[DHT11] ERROR - Invalid reading"
    );

    return;
  }


  Serial.println();

  Serial.println(
    "------------------------------------------------"
  );


  Serial.println(
    "[DHT11]"
  );


  Serial.print(
    "Temperature: "
  );

  Serial.print(
    temperature
  );

  Serial.println(
    " °C"
  );


  Serial.print(
    "Humidity: "
  );

  Serial.print(
    humidity
  );

  Serial.println(
    " %"
  );


  // ----------------------------------------------------------
  // FAN CONTROL
  // ----------------------------------------------------------

  updateFanControl(
    temperature
  );


  // ----------------------------------------------------------
  // STATUS
  // ----------------------------------------------------------

  if (
    temperatureLimitsValid
  )
  {
    if (
      temperature >
      temperatureMax
    )
    {
      Serial.println(
        "STATUS: HIGH TEMPERATURE"
      );

      Serial.println(
        "FAN: ON"
      );
    }


    else if (
      temperature <
      temperatureMin
    )
    {
      Serial.println(
        "STATUS: LOW TEMPERATURE"
      );

      Serial.println(
        "FAN: OFF"
      );
    }


    else
    {
      Serial.println(
        "STATUS: TEMPERATURE NORMAL"
      );

      Serial.println(
        "FAN: OFF"
      );
    }
  }


  // ----------------------------------------------------------
  // FIREBASE PATH
  // ----------------------------------------------------------

  String basePath =
    "/boxes/" +
    String(OWNER_UID) +
    "/" +
    String(BOX_ID);


  // ----------------------------------------------------------
  // TEMPERATURE
  // ----------------------------------------------------------

  if (
    !Database.set<double>(
      aClient,
      basePath +
      "/liveData/temperature",
      temperature
    )
  )
  {
    printFirebaseError(
      "liveData/temperature"
    );
  }


  // ----------------------------------------------------------
  // HUMIDITY
  // ----------------------------------------------------------

  if (
    !Database.set<double>(
      aClient,
      basePath +
      "/liveData/humidity",
      humidity
    )
  )
  {
    printFirebaseError(
      "liveData/humidity"
    );
  }


  // ----------------------------------------------------------
  // FAN STATUS
  // ----------------------------------------------------------

  if (
    !Database.set<bool>(
      aClient,
      basePath +
      "/liveData/fanStatus",
      fanShouldRun
    )
  )
  {
    printFirebaseError(
      "liveData/fanStatus"
    );
  }


  // ----------------------------------------------------------
  // SENSOR TIMESTAMP
  // ----------------------------------------------------------

  Database.set<unsigned long>(
    aClient,
    basePath +
    "/liveData/timestamp",
    millis()
  );


  // ----------------------------------------------------------
  // SENSOR HISTORY
  // ----------------------------------------------------------

  String historyPath =
    basePath +
    "/sensorHistory/" +
    String(millis());


  Database.set<double>(
    aClient,
    historyPath +
    "/temperature",
    temperature
  );


  Database.set<double>(
    aClient,
    historyPath +
    "/humidity",
    humidity
  );


  Database.set<bool>(
    aClient,
    historyPath +
    "/fanStatus",
    fanShouldRun
  );


  Database.set<unsigned long>(
    aClient,
    historyPath +
    "/timestamp",
    millis()
  );


  Serial.println();

  Serial.println(
    "[Firebase] DHT11 + fan status uploaded."
  );
}


// ============================================================
// FAN LOGIC
// ============================================================

void updateFanControl(
  double temperature
)
{
  /*
     Cooling fan runs only when the temperature
     rises ABOVE the configured maximum.

     Example:

       Min = 20
       Max = 30

       18°C -> fan OFF
       25°C -> fan OFF
       30°C -> fan OFF
       31°C -> fan ON
  */


  if (
    !temperatureLimitsValid
  )
  {
    fanShouldRun =
      false;

    return;
  }


  /*
     HIGH temperature:
     turn fan ON.
  */

  if (
    temperature >
    temperatureMax
  )
  {
    fanShouldRun =
      true;
  }


  /*
     Normal or low temperature:
     turn fan OFF.
  */

  else
  {
    fanShouldRun =
      false;
  }


  Serial.print(
    "[FAN] "
  );


  Serial.println(
    fanShouldRun
      ? "ON"
      : "OFF"
  );
}


// ============================================================
// LED FAN INDICATOR
// ============================================================

void updateFanLED()
{
  /*
     If the fan should NOT run,
     LED stays OFF.
  */

  if (
    !fanShouldRun
  )
  {
    ledState =
      false;


    digitalWrite(
      LED_PIN,
      LOW
    );


    return;
  }


  /*
     Fan should run.

     Blink LED continuously.
  */

  if (
    millis() -
    lastLEDBlink >=
    FAN_BLINK_INTERVAL
  )
  {
    lastLEDBlink =
      millis();


    ledState =
      !ledState;


    digitalWrite(
      LED_PIN,
      ledState
        ? HIGH
        : LOW
    );
  }
}


// ============================================================
// PUBLISH FAN STATUS
// ============================================================

void publishFanStatus()
{
  String path =
    "/boxes/" +
    String(OWNER_UID) +
    "/" +
    String(BOX_ID) +
    "/liveData/fanStatus";


  if (
    !Database.set<bool>(
      aClient,
      path,
      fanShouldRun
    )
  )
  {
    printFirebaseError(
      "fanStatus"
    );
  }
}


// ============================================================
// SEND HEARTBEAT
// ============================================================

void sendHeartbeat()
{
  String basePath =
    "/boxes/" +
    String(OWNER_UID) +
    "/" +
    String(BOX_ID);


  Serial.println();

  Serial.println(
    "[Firebase] Sending heartbeat..."
  );


  // ----------------------------------------------------------
  // DEVICE ID
  // ----------------------------------------------------------

  Database.set<String>(
    aClient,
    basePath +
    "/deviceId",
    DEVICE_ID
  );


  // ----------------------------------------------------------
  // CONNECTED
  // ----------------------------------------------------------

  Database.set<bool>(
    aClient,
    basePath +
    "/connected",
    true
  );


  // ----------------------------------------------------------
  // ONLINE
  // ----------------------------------------------------------

  Database.set<bool>(
    aClient,
    basePath +
    "/deviceStatus/online",
    true
  );


  // ----------------------------------------------------------
  // LAST SEEN
  // ----------------------------------------------------------

  Database.set<unsigned long>(
    aClient,
    basePath +
    "/deviceStatus/lastSeen",
    millis()
  );


  Serial.println(
    "[Firebase] ESP32 is ONLINE"
  );
}


// ============================================================
// GPS READING
// ============================================================

void readGPS()
{
  while (
    GPS.available()
  )
  {
    char c =
      GPS.read();


    gps.encode(
      c
    );
  }


  /*
     A new valid GPS location was received.
  */

  if (
    gps.location.isUpdated()
  )
  {
    Serial.println();

    Serial.println(
      "================================================"
    );

    Serial.println(
      "              GPS FIX ACQUIRED"
    );

    Serial.println(
      "================================================"
    );


    Serial.print(
      "Latitude: "
    );

    Serial.println(
      gps.location.lat(),
      6
    );


    Serial.print(
      "Longitude: "
    );

    Serial.println(
      gps.location.lng(),
      6
    );


    Serial.print(
      "Satellites: "
    );


    if (
      gps.satellites.isValid()
    )
    {
      Serial.println(
        gps.satellites.value()
      );
    }
    else
    {
      Serial.println(
        "Unknown"
      );
    }


    Serial.print(
      "Speed: "
    );


    if (
      gps.speed.isValid()
    )
    {
      Serial.print(
        gps.speed.kmph()
      );

      Serial.println(
        " km/h"
      );
    }
    else
    {
      Serial.println(
        "Unknown"
      );
    }


    if (
      millis() -
      lastGPSUpload >=
      GPS_UPLOAD_INTERVAL
    )
    {
      lastGPSUpload =
        millis();


      uploadGPSData();
    }
  }


  /*
     No fix yet.
  */

  if (
    !gps.location.isValid()
  )
  {
    if (
      millis() -
      lastGPSMessage >=
      5000
    )
    {
      lastGPSMessage =
        millis();


      Serial.println();

      Serial.println(
        "[GPS] Receiving data..."
      );


      Serial.print(
        "[GPS] Characters processed: "
      );

      Serial.println(
        gps.charsProcessed()
      );


      Serial.println(
        "[GPS] Waiting for satellite fix..."
      );
    }
  }
}


// ============================================================
// GPS → FIREBASE
// ============================================================

void uploadGPSData()
{
  if (
    !gps.location.isValid()
  )
  {
    return;
  }


  String basePath =
    "/boxes/" +
    String(OWNER_UID) +
    "/" +
    String(BOX_ID);


  // ----------------------------------------------------------
  // LATITUDE
  // ----------------------------------------------------------

  Database.set<double>(
    aClient,
    basePath +
    "/location/latitude",
    gps.location.lat()
  );


  // ----------------------------------------------------------
  // LONGITUDE
  // ----------------------------------------------------------

  Database.set<double>(
    aClient,
    basePath +
    "/location/longitude",
    gps.location.lng()
  );


  // ----------------------------------------------------------
  // GPS STATUS
  // ----------------------------------------------------------

  Database.set<String>(
    aClient,
    basePath +
    "/location/gpsStatus",
    "FIXED"
  );


  // ----------------------------------------------------------
  // SATELLITES
  // ----------------------------------------------------------

  if (
    gps.satellites.isValid()
  )
  {
    Database.set<int>(
      aClient,
      basePath +
      "/location/satellites",
      gps.satellites.value()
    );
  }


  // ----------------------------------------------------------
  // SPEED
  // ----------------------------------------------------------

  if (
    gps.speed.isValid()
  )
  {
    Database.set<double>(
      aClient,
      basePath +
      "/location/speed",
      gps.speed.kmph()
    );
  }


  // ----------------------------------------------------------
  // ALTITUDE
  // ----------------------------------------------------------

  if (
    gps.altitude.isValid()
  )
  {
    Database.set<double>(
      aClient,
      basePath +
      "/location/altitude",
      gps.altitude.meters()
    );
  }


  // ----------------------------------------------------------
  // TIMESTAMP
  // ----------------------------------------------------------

  Database.set<unsigned long>(
    aClient,
    basePath +
    "/location/timestamp",
    millis()
  );


  // ----------------------------------------------------------
  // HISTORY
  // ----------------------------------------------------------

  String historyPath =
    basePath +
    "/locationHistory/" +
    String(millis());


  Database.set<double>(
    aClient,
    historyPath +
    "/latitude",
    gps.location.lat()
  );


  Database.set<double>(
    aClient,
    historyPath +
    "/longitude",
    gps.location.lng()
  );


  Database.set<unsigned long>(
    aClient,
    historyPath +
    "/timestamp",
    millis()
  );


  Serial.println(
    "[Firebase] GPS location uploaded."
  );
}


// ============================================================
// FIREBASE ERROR
// ============================================================

void printFirebaseError(
  const char *operation
)
{
  Serial.print(
    "[Firebase ERROR] "
  );


  Serial.print(
    operation
  );


  Serial.print(
    " | Code: "
  );


  Serial.print(
    aClient.lastError().code()
  );


  Serial.print(
    " | Message: "
  );


  Serial.println(
    aClient.lastError().message()
  );
}