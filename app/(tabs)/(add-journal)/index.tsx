import React, { useState } from "react";
import {
  Alert,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  SafeAreaView,
} from "react-native";
import { router } from "expo-router";
import { FIREBASE_AUTH } from "../../../FirebaseConfig";
import { FIRESTORE_DB } from "../../../FirebaseConfig";
import { addDoc, collection } from "firebase/firestore";
import OpenAI from "openai";

/**
 * Calls the protected prompt function and returns its response.
 *
 * @returns {Promise<any>} The data returned from the protected function.
 */
const callPromptFunc = async (): Promise<any> => {
  try {
    const user = FIREBASE_AUTH.currentUser;
    if (!user) throw new Error("User not authenticated");

    const idToken = await user.getIdToken();

    const response = await fetch(
      "https://fetchprompt-bdm3hcghyq-uc.a.run.app",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ message: "Authenticated request" }),
      }
    );

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error calling protected function:", error);
  }
};

/**
 * JournalEntry component renders a journal entry screen where the user can view a prompt,
 * write their response, and submit it. It also shows a live word counter.
 *
 * @returns {JSX.Element} The rendered journal entry screen.
 */
export default function JournalEntry(): JSX.Element {
  const [prompt, setPrompt] = useState<string>(
    "What are you currently feeling or experiencing?"
  );
  const [response, setResponse] = useState<string>("");
  const [showMessage, setShowMessage] = useState<boolean>(true);
  const wordCount: number = response.trim()
    ? response.trim().split(/\s+/).length
    : 0;
  const currentDate: Date = new Date();
  const maxWords = 1500;
  const openai = new OpenAI({
    apiKey: "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",
  });

  /**
   * Navigates back to the home page.
   *
   * @returns {void}
   */
  const backHome = (): void => {
    router.replace("/(home)/homepage");
  };

  /**
   * Retrieves a new prompt from the protected endpoint and updates the prompt state.
   *
   * @returns {Promise<void>}
   */
  const getPrompt = async (): Promise<void> => {
    const result = await callPromptFunc();
    if (result) {
      setPrompt(result);
    }
  };

  /**
   * Submits the journal response to Firestore.
   *
   * @returns {Promise<void>}
   */
  const handleSubmitResponse = async (): Promise<void> => {
    if (wordCount > maxWords) {
      Alert.alert(
        "Woah, slow your roll!",
        "Please enter an entry that is between 50 and 1500 words."
      );
      return;
    }
    try {
      const user = FIREBASE_AUTH.currentUser; // Get the current user's UID from Firebase Auth

      // Analyze sentiment with call to ChatGPT

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "user",
            content: `"${response}"
            Does this journal entry have a positive, negative, or mixed sentiment? Provide your answer with just one of these 3 words and nothing else.`,
        }],
    });

    const sentimentString = completion.choices[0].message.content;

    console.log(sentimentString);


      if (user) {
        await addDoc(collection(FIRESTORE_DB, "journal-responses"), {
          response: response,
          date: currentDate.toLocaleDateString(),
          timestamp: new Date(),
          userId: user.uid, // Track the user who submitted the response
          sentiment: sentimentString,
        });
        router.replace("/(add-journal)/confirmation");
        setResponse(""); // Clear input after submission

      } else {
        Alert.alert("You need to be logged in to submit a response.");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Failed to submit response. Please try again.");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F0ECE0" }}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior="height"
        keyboardVerticalOffset={500}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <TouchableOpacity onPress={backHome}>
            <Image
              source={require("../../../assets/images/close-button.png")}
              style={styles.close}
            />
          </TouchableOpacity>
          <Text style={styles.prompt}>{prompt}</Text>
          <TextInput
            placeholder="Start writing..."
            placeholderTextColor="#b4bcbc"
            style={styles.input}
            multiline
            value={response}
            onChangeText={setResponse}
          />
          <View style={styles.footer}>
            <View style={styles.wordCount}>
              <Text
                style={[
                  styles.maxWordDisplay,
                  wordCount > maxWords
                    ? { color: "red" }
                    : { color: "#706645" },
                ]}
              >
                {wordCount}/{maxWords} words
              </Text>
            </View>
            <View style={styles.buttons}>
              <TouchableOpacity
                style={styles.help}
                onPress={() => {
                  getPrompt();
                }}
              >
                <Image
                  source={require("../../../assets/images/fire.png")}
                  style={styles.check}
                />
              </TouchableOpacity>
              {showMessage && (
                <Text style={styles.generatePromptText}>
                  &lt;- Generate a random prompt
                </Text>
              )}
              <TouchableOpacity
                style={styles.finished}
                onPress={handleSubmitResponse}
              >
                <Image
                  source={require("../../../assets/images/check.png")}
                  style={styles.check}
                />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  buttons: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },

  check: {
    resizeMode: "center",
  },

  close: {
    height: 30,
    marginLeft: 10,
    marginTop: 10,
    resizeMode: "cover",
    width: 30,
  },

  container: {
    backgroundColor: "#F0ECE0",
    flex: 1,
  },

  footer: {
    flex: 1,
    marginBottom: 15,
  },

  generatePromptText: {
    color: "#706645",
    fontFamily: "Poppins",
    fontSize: 14,
    marginHorizontal: 10,
  },

  help: {
    alignItems: "center",
    backgroundColor: "#F0ECE0",
    borderColor: "#706645CC",
    borderRadius: 30,
    borderWidth: 2,
    height: 60,
    justifyContent: "center",
    marginLeft: 27,
    width: 60,
  },

  input: {
    alignSelf: "center",
    color: "#3C4444",
    fontFamily: "Poppins",
    fontSize: 16,
    fontWeight: "400",
    height: 200,
    lineHeight: 24,
    paddingLeft: 9,
    textAlignVertical: "top",
    width: 346,
  },

  maxWordDisplay: {
    color: "#706645",
    fontFamily: "Poppins",
    fontSize: 14,
  },

  prompt: {
    alignSelf: "center",
    borderLeftColor: "#706645",
    borderLeftWidth: 2,
    color: "#706645",
    fontFamily: "Poppins",
    fontSize: 16,
    fontWeight: "400",
    marginBottom: 25,
    marginTop: 20,
    paddingLeft: 9,
    width: 346,
  },

  finished: {
    alignItems: "center",
    backgroundColor: "#7E948C",
    borderRadius: 30,
    height: 60,
    justifyContent: "center",
    marginRight: 27,
    width: 60,
  },
  
  wordCount: {
    alignItems: "flex-end",
    flex: 1,
    justifyContent: "flex-end",
    marginBottom: 25,
    marginLeft: 27,
    marginRight: 27,
    marginTop: 25,
  },
});
