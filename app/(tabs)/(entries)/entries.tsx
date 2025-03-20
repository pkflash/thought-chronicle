import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import {
  collection,
  getDocs,
  deleteDoc,
  query,
  where,
  doc,
} from "firebase/firestore";
import { getAuth, signOut } from "firebase/auth";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { format } from "date-fns";
import DateTimePicker from "@react-native-community/datetimepicker";
import { FIREBASE_AUTH, FIRESTORE_DB } from "../../../FirebaseConfig";

/**
 * Interface representing a journal entry.
 */
interface JournalEntry {
  id: string;
  response: string;
  timestamp: Date | null;
  sentiment: string;
}

/**
 * Interface representing a daily response.
 */
interface DailyResponse {
  id: string;
  response: string;
  timestamp: Date | null;
}

/**
 * EntryPage component displays a daily question response and journal entries
 * for a given date. It allows the user to change the date, sign out, and navigate
 * to detailed entry screens.
 *
 * @returns {JSX.Element} The rendered entry page.
 */
export default function EntryPage(): JSX.Element {
  // Access the "date" parameter from the route.
  const { date } = useLocalSearchParams<{ date: string }>();
  // Format the date string to PST.
  const pstDateString = `${date}T00:00:00-08:00`;

  // State variables.
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<Date>(
    new Date(pstDateString)
  );
  const [dailyResponse, setDailyResponse] = useState<DailyResponse | null>(
    null
  );
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [isDatePickerVisible, setIsDatePickerVisible] =
    useState<boolean>(false);
  const [currentPickerType, setCurrentPickerType] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const router = useRouter();

  const auth = getAuth();
  const currentUser = auth.currentUser;

  /**
   * Toggles the visibility of the dropdown menu.
   *
   * @returns {void}
   */
  const toggleDropdown = (): void => {
    setShowDropdown((prev) => !prev);
  };

  /**
   * Signs out the current user.
   *
   * @returns {Promise<void>}
   */
  const handleSignOut = async (): Promise<void> => {
    try {
      await signOut(FIREBASE_AUTH);
      Alert.alert("Signed out successfully!");
      router.replace("/(setup)");
    } catch (error: unknown) {
      console.error(error);
      Alert.alert("Failed to sign out. Please try again.");
    }
  };

  /**
   * Handles changes from the date picker.
   *
   * @param _event - The event object (unused).
   * @param selected - The selected date (if any).
   * @returns {void}
   */
  const handleDateChange = (_event: unknown, selected?: Date): void => {
    if (selected) {
      setSelectedDate(selected);
    }
    setIsDatePickerVisible(false);
  };

  /**
   * Formats a Date into a string for Firestore queries.
   *
   * @param dateObj - The date to format.
   * @returns {string} The formatted date.
   */
  const formatDateForFirestore = (dateObj: Date): string => {
    return dateObj.toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    });
  };

  /**
   * Formats a Date into a state-friendly string (YYYY-MM-DD).
   *
   * @param dateObj - The date to format.
   * @returns {string} The formatted date.
   */
  const formatDateForState = (dateObj: Date): string => {
    return format(dateObj, "yyyy-MM-dd");
  };

  /**
   * Fetches the daily question response and journal entries for the selected date.
   *
   * @returns {Promise<void>}
   */
  const fetchResponses = async (): Promise<void> => {
    if (!currentUser?.uid) {
      console.error("User not logged in!");
      return;
    }

    setLoading(true);
    const firestoreDate = formatDateForFirestore(selectedDate);

    try {
      // Fetch Daily Question Response.
      const dailyQuestionQuery = query(
        collection(FIRESTORE_DB, "daily-question-responses"),
        where("date", "==", firestoreDate),
        where("userId", "==", currentUser.uid)
      );

      const dailyQuestionSnapshot = await getDocs(dailyQuestionQuery);
      if (dailyQuestionSnapshot.docs.length > 0) {
        const docSnap = dailyQuestionSnapshot.docs[0]; // Assuming one response per day.
        const docData = docSnap.data();
        setDailyResponse({
          id: docSnap.id,
          response: docData.response || "",
          timestamp: docData.timestamp ? docData.timestamp.toDate() : null,
        });
      } else {
        setDailyResponse(null);
      }

      // Fetch Journal Entries.
      const journalQuery = query(
        collection(FIRESTORE_DB, "journal-responses"),
        where("date", "==", firestoreDate),
        where("userId", "==", currentUser.uid)
      );

      const journalSnapshot = await getDocs(journalQuery);
      const journalEntriesData: JournalEntry[] = [];
      journalSnapshot.forEach((docSnap) => {
        const docData = docSnap.data();
        journalEntriesData.push({
          id: docSnap.id,
          response: docData.response || "",
          timestamp: docData.timestamp ? docData.timestamp.toDate() : null,
          sentiment: docData.sentiment ? docData.sentiment : null,
        });
      });
      setJournalEntries(journalEntriesData);
    } catch (error: unknown) {
      console.error("Error fetching responses:", error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchResponses();
    }, [selectedDate])
  );

  /**
   * Handles deleting an entry (daily response or journal entry) from Firestore.
   *
   * @param {string} entryType - The type of entry ("daily-question-responses" or "journal-responses").
   * @param {DailyResponse | JournalEntry | null} entry - The entry object.
   * @returns {Promise<void>}
   */
  const handleDelete = async (
    entryType: "daily-question-responses" | "journal-responses",
    entry: DailyResponse | JournalEntry | null
  ): Promise<void> => {
    console.log("handleDelete called with:", entryType, entry); // Debugging log

    if (!entry || !entry.id) {
      console.error(`No ${entryType} entry found or missing ID.`);
      return;
    }

    Alert.alert("Delete Entry", "Are you sure you want to delete this entry?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "OK",
        onPress: async (): Promise<void> => {
          try {
            console.log("Attempting to delete entry with ID:", entry.id);
            const docRef = doc(FIRESTORE_DB, entryType, entry.id);
            await deleteDoc(docRef);
            console.log("Document successfully deleted!");

            // Navigate back to entries page
            const entryDate = entry.timestamp
              ? format(entry.timestamp, "yyyy-MM-dd")
              : format(new Date(), "yyyy-MM-dd");
            router.replace(`/(entries)/entries?date=${entryDate}`);
          } catch (error) {
            console.error("Error removing document:", error);
          }
        },
      },
    ]);
  };

  /**
   * Formats a timestamp into a short time string.
   *
   * @param timestamp - The timestamp to format.
   * @returns {string} The formatted time.
   */
  const formatTime = (timestamp: Date | null): string => {
    if (!timestamp) return "";
    return timestamp.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  /**
   * Renders the main content for the selected date, including the daily question response
   * and any journal entries.
   *
   * @returns {JSX.Element} The rendered content.
   */
  const renderDateContent = (): JSX.Element => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#706645" />
        </View>
      );
    }

    const hasContent = dailyResponse || journalEntries.length > 0;

    return (
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        indicatorStyle="black"
        scrollIndicatorInsets={{ right: 1 }}
      >
        <Text style={styles.dateText}>
          <Text style={styles.boldDay}>
            {selectedDate.toLocaleDateString("en-US", { weekday: "long" })},
          </Text>{" "}
          {selectedDate.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </Text>

        {hasContent ? (
          <>
            {/* Daily Question Response */}
            {dailyResponse && (
              <View style={styles.dateEntryContainer}>
                <TouchableOpacity
                  style={styles.entryContainer}
                  onPress={() => {
                    router.push(
                      `../(add-journal)/daily-response/${dailyResponse.id}`
                    );
                  }}
                >
                  <Image
                    source={require("../../../assets/images/question_mark.png")}
                    style={styles.entryImage}
                    resizeMode="contain"
                  />
                  <View style={styles.textContainer}>
                    <View style={styles.titleRow}>
                      {/* Left Side: Label & Timestamp */}
                      <View style={styles.titleTextContainer}>
                        <Text style={styles.entryLabel}>DAILY QUESTION</Text>
                        {dailyResponse.timestamp && (
                          <Text style={styles.timestampText}>
                            {formatTime(dailyResponse.timestamp)}
                          </Text>
                        )}
                      </View>

                      {/* Right Side: Image */}
                      <TouchableOpacity
                        onPress={() =>
                          handleDelete(
                            "daily-question-responses",
                            dailyResponse
                          )
                        }
                      >
                        <Image
                          source={require("../../../assets/images/delete.png")}
                          style={styles.titleImage}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                    </View>
                    <Text
                      style={styles.entryText}
                      numberOfLines={5}
                      ellipsizeMode="tail"
                    >
                      {dailyResponse.response}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Journal Entries */}
            {journalEntries.map((entry, index) => (
              <View style={styles.dateEntryContainer} key={index}>
                <TouchableOpacity
                  style={styles.entryContainer}
                  onPress={() => {
                    router.push(`../(add-journal)/journal-entry/${entry.id}`);
                    console.log("pressed journal entry");
                    console.log("pressed journal entry");
                  }}
                >
                  <Image
                    source={entry.sentiment ? 
                      (entry.sentiment === "Positive" ? require("../../../assets/images/Smile.png") 
                      : entry.sentiment === "Negative" ? require("../../../assets/images/Frown.png")
                      : entry.sentiment === "Mixed" ? require("../../../assets/images/Neutral Face.png")
                      : require("../../../assets/images/journal.png"))

                    : require("../../../assets/images/journal.png")}
                    style={styles.entryImage}
                    resizeMode="contain"
                  />
                  <View style={styles.textContainer}>
                    <View style={styles.titleRow}>
                      {/* Left Side: Label & Timestamp */}
                      <View style={styles.titleTextContainer}>
                        <Text style={styles.entryLabel}>JOURNAL</Text>
                        {entry.timestamp && (
                          <Text style={styles.timestampText}>
                            {formatTime(entry.timestamp)}
                          </Text>
                        )}
                      </View>
                      {/* Right Side: Image */}
                      <TouchableOpacity
                        onPress={() => handleDelete("journal-responses", entry)}
                      >
                        <Image
                          source={require("../../../assets/images/delete.png")}
                          style={styles.titleImage}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                    </View>
                    <Text
                      style={styles.entryText}
                      numberOfLines={5}
                      ellipsizeMode="tail"
                    >
                      {entry.response}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </>
        ) : (
          <View style={styles.noContentContainer}>
            <Text style={styles.noContentText}>
              No responses or journal entries for this day.
            </Text>
          </View>
        )}
      </ScrollView>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => {
                router.push({ pathname: "/(entries)", params: {} });
              }}
              style={styles.backButton}
            >
              <Image
                source={require("../../../assets/images/back_arrow.png")}
                style={styles.backButtonImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
            <View>
              <TouchableOpacity onPress={toggleDropdown}>
                <Image
                  source={require("../../../assets/images/profile.png")}
                  style={styles.image}
                  resizeMode="contain"
                />
              </TouchableOpacity>
              {showDropdown && (
                <View style={styles.dropdownMenu}>
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={handleSignOut}
                  >
                    <Text style={styles.dropdownText}>Sign Out</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
          {/* Date Picker */}
          {isDatePickerVisible && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={handleDateChange}
              textColor="black"
            />
          )}
          {/* Scrollable Content */}
          <View style={{ flex: 1 }}>
            <ScrollView>{renderDateContent()}</ScrollView>
          </View>
          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={() => {
                router.replace("/(home)/homepage");
              }}
            >
              <Image
                source={require("../../../assets/images/today.png")}
                style={styles.footerImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
            <TouchableOpacity>
              <Image
                source={require("../../../assets/images/entries.png")}
                style={styles.footerImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                router.replace("/(add-journal)/");
              }}
            >
              <Image
                source={require("../../../assets/images/circle.png")}
                style={styles.footerImage}
                resizeMode="contain"
              />
              <Text style={styles.plusSign}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                router.replace("/(global-board)");
              }}
            >
              <Image
                source={require("../../../assets/images/feed.png")}
                style={styles.footerImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                router.replace("/(home)/homepage");
              }}
            >
              <Image
                source={require("../../../assets/images/friends.png")}
                style={styles.footerImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    borderRadius: 20,
    padding: 10,
  },

  backButtonImage: {
    height: 30,
    width: 30,
  },

  boldDay: {
    fontWeight: "bold",
  },

  container: {
    backgroundColor: "#F0ECE0",
    flex: 1,
  },

  dateEntryContainer: {
    marginBottom: 10,
  },

  dateText: {
    color: "#706645",
    fontFamily: "Poppins",
    fontSize: 20,
    fontWeight: "400",
    marginBottom: 10,
  },

  dropdownItem: {
    borderBottomColor: "#EEE",
    borderBottomWidth: 1,
    padding: 10,
  },

  dropdownMenu: {
    backgroundColor: "#FFF",
    borderRadius: 8,
    elevation: 5,
    position: "absolute",
    right: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    top: 50,
    width: 100,
    zIndex: 10,
  },

  dropdownText: {
    color: "#706645",
    fontFamily: "Poppins",
    fontSize: 16,
  },

  entryContainer: {
    alignItems: "flex-start",
    backgroundColor: "#FDFCF3",
    borderRadius: 15,
    flexDirection: "row",
    marginBottom: 10,
    minHeight: 130,
    overflow: "hidden",
    padding: 10,
  },

  entryImage: {
    height: 30,
    marginLeft: 10,
    marginRight: 20,
    marginTop: 40,
    width: 30,
  },

  entryLabel: {
    color: "#706645CC",
    fontSize: 13,
    fontWeight: "400",
    marginTop: 10,
    letterSpacing: 13 * 0.1,
  },

  entryText: {
    color: "#706645CC",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 10,
    marginRight: 10,
  },

  footer: {
    backgroundColor: "#F0ECE0",
    borderTopColor: "#70664533",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 20,
  },

  footerImage: {
    height: 50,
    width: 50,
  },

  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 20,
    marginTop: 25,
  },

  image: {
    height: 40,
    width: 40,
  },

  loadingContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },

  noContentContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    marginTop: 50,
  },

  noContentText: {
    color: "#706645",
    fontSize: 16,
    fontStyle: "italic",
  },

  noDataText: {
    color: "#888",
    fontSize: 14,
    fontStyle: "italic",
    marginTop: 10,
  },

  plusSign: {
    color: "white",
    fontSize: 30,
    fontWeight: "400",
    marginLeft: 15.5,
    marginTop: 4,
    position: "absolute",
  },

  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 100,
  },

  scrollView: {
    flex: 1,
  },

  textContainer: {
    flex: 1,
  },

  timestampText: {
    color: "#706645CC",
    fontFamily: "Poppins",
    fontSize: 11,
    fontWeight: "300",
    marginRight: 25,
  },

  titleImage: {
    width: 23,
    height: 23,
    marginTop: 5,
    marginRight: 10,
  },

  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },

  titleTextContainer: {
    flexDirection: "column",
    justifyContent: "center",
  },
});
