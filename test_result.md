#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Werkbon/Timesheet app voor de bouwsector met:
  - Login met bedrijfse-mail
  - Team beheer (vooraf ingestelde teamleden)
  - Klant en Werf beheer
  - Werkbon aanmaken met weekoverzicht en gewerkte uren
  - Digitale handtekening
  - PDF export
  - E-mail verzending (placeholder - later implementeren)

backend:
  - task: "User Authentication (Register/Login)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Implemented register and login endpoints. Tested with curl - working"
      - working: true
        agent: "testing"
        comment: "Comprehensive testing completed. Login with test@smart-techbv.be works correctly. Register endpoint creates users. Error handling (401 for invalid credentials) working properly. All authentication flows verified."
      - working: true
        agent: "testing"
        comment: "ADMIN LOGIN VERIFICATION COMPLETE: Admin login with info@smart-techbv.be / smart123 working perfectly. Response contains all required fields (id, email, naam, rol, actief). User rol correctly set to 'admin'. Wrong password returns 401 as expected. Admin user already exists in system."
      - working: true
        agent: "testing"
        comment: "COMPREHENSIVE TEST COMPLETE: All authentication requirements from review verified. Admin login with info@smart-techbv.be/smart123 returns rol='admin'. GET /api/auth/users lists all users including werknemers (3 users found). User registration and deactivation working perfectly. All security requirements met."

  - task: "Team Members CRUD"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "GET/POST/PUT/DELETE for team members. Tested with curl"
      - working: true
        agent: "testing"
        comment: "All team CRUD operations verified. Created team member 'Piet van der Berg', updated name successfully, soft delete working (sets actief=false). GET returns active members only. All operations working correctly."
      - working: true
        agent: "testing"
        comment: "COMPREHENSIVE TEST COMPLETE: All team CRUD operations verified in review testing. GET /api/teams works, POST creates teams with member lists, PUT updates successfully, DELETE performs soft delete (actief=false). All team management functionality working perfectly."

  - task: "Klanten (Customers) CRUD"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Full CRUD for customers. Tested with curl"
      - working: true
        agent: "testing"
        comment: "Customer CRUD fully functional. Created 'Bouwbedrijf Van Houten BV' with email/phone/address. Update operations work correctly. Soft delete implemented. All validation and data integrity verified."
      - working: true
        agent: "testing"
        comment: "COMPREHENSIVE TEST COMPLETE: All klanten CRUD operations verified. GET /api/klanten retrieves customer list, POST creates customers with all fields (naam, email, uurtarief), all validation working. Customer management fully functional."

  - task: "Werven (Worksites) CRUD"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Full CRUD for worksites linked to customers. Tested with curl"
      - working: true
        agent: "testing"
        comment: "Worksite CRUD operations working perfectly. Created worksite linked to customer, GET /werven/klant/{id} endpoint working for customer-specific worksites. Foreign key validation working (requires valid klant_id). All operations verified."
      - working: true
        agent: "testing"
        comment: "COMPREHENSIVE TEST COMPLETE: All werven CRUD operations verified. GET /api/werven works, POST creates werven with valid klant_id, GET /api/werven/klant/{klant_id} returns customer-specific werven. Foreign key validation working correctly."

  - task: "Werkbonnen (Timesheets) CRUD"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Full CRUD for timesheets with hours per team member. Tested with curl"
      - working: true
        agent: "testing"
        comment: "Werkbonnen CRUD fully operational. Created timesheet with realistic hours data for multiple team members. Signature update working - status changes to 'ondertekend' when signature added. Send functionality working (email placeholder implemented). All timesheet workflows verified."
      - working: true
        agent: "testing"
        comment: "COMPREHENSIVE TEST COMPLETE: All werkbonnen CRUD operations verified. GET /api/werkbonnen works, POST creates complete werkbonnen with hours data, GET /api/werkbonnen/{id} retrieves single werkbon, PUT adds signatures (status→ondertekend), POST /verzenden implements email placeholder. Full workflow operational."

  - task: "Bedrijfsinstellingen (Company Settings)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "GET/PUT for company settings"
      - working: true
        agent: "testing"
        comment: "Company settings endpoints working correctly. GET returns default settings if none exist (Smart-Tech BV). PUT updates work properly with partial updates. All settings fields (bedrijfsnaam, email, telefoon, kvk_nummer, etc) functioning."
      - working: true
        agent: "testing"
        comment: "COMPREHENSIVE TEST COMPLETE: All company settings operations verified. GET /api/instellingen returns current settings (Smart-Tech BV), PUT /api/instellingen updates all fields including bedrijfsnaam, adres, logo_base64, pdf_voettekst. All settings management working perfectly."

  - task: "Werknemer verwijderen"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "DELETE /api/auth/users/{user_id} tested with curl. Temporary worker created, deleted successfully, and confirmed absent from GET /api/auth/users."

  - task: "Werkbon PDF + e-mail verzending"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 1
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Backend now generates a PDF attachment and attempts Resend delivery to company + klant. Curl verified PDF generation, totals, and status handling. Current blocking factor: Resend still rejects sending until smart-techbv.be domain is verified by the user."

frontend:
  - task: "Login/Register Screens"
    implemented: true
    working: true
    file: "/app/frontend/app/(auth)/login.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Login and register screens with Dutch UI. Screenshot verified"

  - task: "Werkbonnen List Screen"
    implemented: true
    working: true
    file: "/app/frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Shows list of werkbonnen with status badges. Screenshot verified"

  - task: "Beheer Screen (Team/Klanten/Werven/Instellingen)"
    implemented: true
    working: true
    file: "/app/frontend/app/(tabs)/beheer.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Tab-based management screen. Screenshot verified"

  - task: "New Werkbon Screen"
    implemented: true
    working: true
    file: "/app/frontend/app/werkbon/nieuw.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Week selector, klant/werf selection, hours table. Screenshot verified"

  - task: "Werkbon Detail Screen"
    implemented: true
    working: true
    file: "/app/frontend/app/werkbon/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Shows werkbon details, hours table, signature and PDF buttons. Screenshot verified"

  - task: "Signature Screen"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/handtekening/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Signature canvas works on native (iOS/Android) but not on web - this is expected behavior for react-native-signature-canvas"

  - task: "Profile Screen"
    implemented: true
    working: true
    file: "/app/frontend/app/(tabs)/profiel.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Shows user info and logout button"

  - task: "Werknemer verwijderen UI"
    implemented: true
    working: true
    file: "/app/frontend/app/(tabs)/beheer.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Web preview screenshot flow verified: admin logged in, deleted a temporary worker from Beheer > Werknemers, and worker disappeared from the list."

  - task: "Handtekening opslaan + terug naar werkbon"
    implemented: true
    working: true
    file: "/app/frontend/app/handtekening/[id].tsx"
    stuck_count: 1
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Handtekening screen now saves, redirects back to werkbon detail, and detail screen fetch uses a cache-busting parameter. Signed werkbon state verified in web preview with status Ondertekend and send-PDF button visible after reload."

  - task: "Werkbon detail - Versturen als PDF knop"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/werkbon/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Button now calls backend PDF/email endpoint and handles success/failure messaging. UI click verified in preview, but successful external e-mail delivery is blocked until Resend domain verification is completed by the user."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "Werknemer verwijderen"
    - "Werknemer verwijderen UI"
    - "Handtekening opslaan + terug naar werkbon"
    - "Werkbon PDF + e-mail verzending"
    - "Werkbon detail - Versturen als PDF knop"
  stuck_tasks:
    - "Werkbon PDF + e-mail verzending"
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      MVP implementation complete. All backend APIs implemented and tested with curl.
      Frontend screens implemented with Dutch UI:
      - Login/Register
      - Werkbonnen list
      - Beheer (Team, Klanten, Werven, Instellingen tabs)
      - New Werkbon creation
      - Werkbon detail with hours table
      - Signature screen (works on native only)
      - Profile screen
      
      Please test all backend APIs thoroughly. Focus on:
      1. Authentication flow
      2. CRUD operations for team, klanten, werven
      3. Werkbon creation and update (including signature)
      
      Test credentials: test@smart-techbv.be / test123
  - agent: "testing"
    message: |
      Backend API testing COMPLETED successfully! 
      
      VERIFIED WORKING:
      ✅ Authentication: Register/Login with test@smart-techbv.be working perfectly
      ✅ Team Members CRUD: All operations (create, read, update, soft delete) verified  
      ✅ Klanten CRUD: Customer management fully functional with validation
      ✅ Werven CRUD: Worksite management working, linked to customers correctly
      ✅ Werkbonnen CRUD: Timesheet creation/update/signature workflow verified
      ✅ Company Settings: GET/PUT operations working correctly
      ✅ Error Handling: Proper HTTP status codes (401 unauthorized, 404 not found)
      ✅ Email Placeholder: Send werkbon endpoint implemented as placeholder
      
      All backend APIs are production-ready. The comprehensive test suite created covers:
      - Real construction company data (Bouwbedrijf Van Houten BV)
      - Complete CRUD workflows
      - Signature functionality (status changes to 'ondertekend')
      - Error handling scenarios
      
      Backend testing is COMPLETE. All endpoints working correctly at https://timesheet-verify.preview.emergentagent.com/api
  - agent: "testing"
    message: |
      ADMIN LOGIN TESTING COMPLETED SUCCESSFULLY!
      
      VERIFIED ADMIN LOGIN FUNCTIONALITY:
      ✅ Admin Login Success: POST /api/auth/login with info@smart-techbv.be / smart123 returns 200 OK
      ✅ Required Fields: Response contains all required fields (id, email, naam, rol, actief)
      ✅ Admin Role Assignment: User rol is correctly set to "admin" 
      ✅ Wrong Password Handling: Returns 401 Unauthorized for incorrect password
      
      ADMIN USER DATA VERIFIED:
      - id: admin-001
      - email: info@smart-techbv.be
      - naam: Beheerder
      - rol: admin
      - actief: true
      
      ALL ADMIN LOGIN REQUIREMENTS MET. Authentication system working perfectly for frontend integration.
  - agent: "testing"
    message: |
      COMPREHENSIVE BACKEND TESTING COMPLETED - ALL REVIEW REQUIREMENTS VERIFIED!
      
      EXECUTED FULL TEST SUITE (21 TESTS - 100% SUCCESS RATE):
      
      📋 TEST SUITE 1: USER AUTHENTICATION
      ✅ Admin Login with info@smart-techbv.be / smart123 → rol: "admin" VERIFIED
      ✅ GET /api/auth/users → Lists all users including werknemers (3 users found)
      ✅ All required fields present in login response
      
      📋 TEST SUITE 2: WERKNEMERS MANAGEMENT  
      ✅ POST /api/auth/register with new werknemer email → Working perfectly
      ✅ PUT /api/auth/users/{id} with {actief: false} → User deactivation successful
      
      📋 TEST SUITE 3: TEAMS
      ✅ GET /api/teams → Returns team list correctly
      ✅ POST /api/teams with {naam: "Test Team", leden: ["Jan", "Piet"]} → Team created
      ✅ PUT /api/teams/{id} → Team update successful  
      ✅ DELETE /api/teams/{id} → Soft delete working (actief: false)
      
      📋 TEST SUITE 4: KLANTEN
      ✅ GET /api/klanten → Customer list retrieved
      ✅ POST /api/klanten with {naam: "Test Klant", email: "klant@test.nl", uurtarief: 50} → Created successfully
      
      📋 TEST SUITE 5: WERVEN
      ✅ GET /api/werven → Worksite list retrieved
      ✅ POST /api/werven (with valid klant_id) → Worksite created with customer link
      ✅ GET /api/werven/klant/{klant_id} → Customer-specific werven working
      
      📋 TEST SUITE 6: WERKBONNEN  
      ✅ GET /api/werkbonnen → Timesheet list retrieved
      ✅ POST /api/werkbonnen with full data → Complete werkbon creation working
      ✅ GET /api/werkbonnen/{id} → Single werkbon retrieval working
      ✅ PUT /api/werkbonnen/{id} with signature data → Status changes to 'ondertekend'
      ✅ POST /api/werkbonnen/{id}/verzenden → Email placeholder working correctly
      
      📋 TEST SUITE 7: SETTINGS
      ✅ GET /api/instellingen → Company settings retrieved (Smart-Tech BV)  
      ✅ PUT /api/instellingen with {bedrijfsnaam, adres, logo_base64, pdf_voettekst} → All updates working
      
      🎯 ALL CRUD OPERATIONS VERIFIED:
      - Create, Read, Update, Delete working on all entities
      - Proper HTTP status codes (200, 400, 401, 404)
      - Data validation and foreign key constraints working
      - Signature workflow complete (concept → ondertekend → verzonden)
      - Email placeholders implemented correctly
      - Company settings management functional
      
      🔒 SECURITY VERIFIED:
      - Admin login working with correct role assignment
      - User deactivation working  
      - Authentication flow complete
      - Error handling proper (401 for invalid credentials)
      
      BACKEND IS PRODUCTION READY - All review requirements satisfied!
  - agent: "main"
    message: |
      NEW FEATURES IMPLEMENTED (2026-03-11) - FORKED SESSION:
      
      BACKEND CHANGES:
      - Added selfie_data field to Werkbon and WerkbonUpdate models
      - Added GET /api/rapporten/uren endpoint: aggregates worker hours per period (week/month)
      
      FRONTEND CHANGES:
      - Fixed Kopieren button: removed showConfirm dialog, now directly copies and navigates to edit screen
      - handtekening/[id].tsx: Added optional Selfie button (expo-image-picker) and disabled SMS button (Binnenkort beschikbaar)
      - NEW: (tabs)/rapport.tsx - New Rapport tab showing per-worker hours, weekly/monthly selector, CSV export
      - (tabs)/_layout.tsx: Added Rapport tab (admin only)
      - appStore.ts: Added selfie_data to Werkbon interface
      
      NEEDS TESTING:
      - Kopieren button (should now work directly without confirmation)
      - Selfie button on handtekening screen
      - SMS button shows as disabled
      - Rapport tab with weekly/monthly filter
      - CSV export from Rapport screen
      - Admin login: info@smart-techbv.be / smart123

backend:
  - task: "Uren Rapport Endpoint"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added GET /api/rapporten/uren with jaar, week (optional), maand (optional) params. Aggregates werkbonnen data by worker name and werf."

frontend:
  - task: "Kopieren Button Fix"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/index.tsx"
    stuck_count: 1
    priority: "high"
    needs_retesting: true
    status_history:
      - working: false
        agent: "main"
        comment: "User reported kopieren button not working. Fixed by removing showConfirm dialog and making it a direct async call."

  - task: "Selfie + SMS on Signature Screen"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/handtekening/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added optional Selfie button using expo-image-picker (front camera on native, file picker on web). Added disabled SMS button with 'Binnenkort' badge."

  - task: "Rapport Tab - Per Worker Hours"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/rapport.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "New Rapport tab showing per-worker hours with week/month selector. CSV export functionality for both web and native."

  - task: "Email Versturen Naar Klant (Checkbox + Manual Email)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/werkbon/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added 'Ook versturen naar klant' checkbox + email input. Default: only company email. If checked and email entered: sends to both. Backend updated with klant_email query param."

  - task: "Bewerken Screen Full Editability"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/werkbon/bewerken/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added week nr selector (+/- buttons), klant dropdown (Modal picker), werf dropdown (filtered by klant). All fields now editable including week, klant, werf."

  - task: "Beheer Instellingen Toggles (Selfie/SMS/Email)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/beheer.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added App Instellingen section with toggles: Selfie bij handtekening, SMS verificatie (disabled), Automatisch naar klant sturen."

  - task: "PDF Layout Redesign (TIMESHEET header + week nr on left)"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Redesigned PDF header: TIMESHEET dark heading at top, Logo+Week nr in left column, Company name (bold) + details in right column. New logo from MongoDB."

  - task: "App Name Smart-TS"
    implemented: true
    working: "NA"
    file: "/app/frontend/app.json"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Changed app name from 'frontend' to 'Smart-TS' in app.json."

IMPORTANT NOTE FOR TESTING AGENT:
- DO NOT delete, soft-delete, or modify any existing werkbonnen or werf/klant data
- DO NOT run cleanup scripts that modify real user data
- Only create new test data if needed
- Admin login: info@smart-techbv.be / smart123
